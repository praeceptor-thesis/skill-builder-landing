// Capability contracts for the registry worker — declaration, persistence, and
// the execution gate — run in-process against a Map-backed KV stub.
//
// The contract under test: a skill declares the model abilities an invoker
// needs; `required` ones gate execution on a runtime that lacks them, while
// `preferred` ones only mark the run degraded. The declaration survives the
// publish round trip, reaches the markdown artifact, and is reachable at the
// top level of a listed skill so a caller need not open the spec.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import worker from '../skill-persistence-worker.js';

function makeKV() {
  const store = new Map();
  return {
    store,
    async get(key, opts) {
      const raw = store.get(key);
      if (raw === undefined) return null;
      const wantJson = opts === 'json' || (opts && opts.type === 'json');
      return wantJson ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = '' } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

const AI = { run: async () => ({ response: 'executed' }) };

function seedUser(kv, handle) {
  const email = `${handle}@example.test`;
  kv.store.set(`users/${email}`, JSON.stringify({
    id: `id-${handle}`, name: handle, handle, email, createdAt: '2026-01-01T00:00:00Z',
  }));
  kv.store.set(`handles/${handle}`, email);
  kv.store.set(`tokens/tok-${handle}`, email);
  return `tok-${handle}`;
}

function spec(name, capabilities) {
  return {
    name,
    description: `${name} does one thing well`,
    category: 'Utilities',
    tags: ['test'],
    purpose: 'testing',
    instructions: ['do the thing'],
    promptTemplate: 'Do {{input}}',
    examples: [],
    tests: [],
    ...(capabilities ? { capabilities } : {}),
  };
}

async function call(env, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await worker.fetch(
    new Request(`https://skills.dmzagent.com${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

const data = (res) => res.body?.data ?? res.body;
const error = (res) => res.body?.error ?? {};

let env;
let alice;

beforeEach(() => {
  const SKILL_STORE = makeKV();
  env = { SKILL_STORE, AI };
  alice = seedUser(SKILL_STORE, 'alice');
});

const publish = (id, capabilities) =>
  call(env, 'POST', '/api/skills', { token: alice, body: { id, spec: spec(id, capabilities) } });

describe('runtime profile', () => {
  it('advertises what the execution runtime can do', async () => {
    const res = await call(env, 'GET', '/api/runtime/profile');
    assert.equal(res.status, 200);
    assert.equal(data(res).id, 'preview-sandbox');
    assert.ok(Array.isArray(data(res).capabilities));
    assert.ok(data(res).capabilities.includes('structured-output'));
    assert.ok(!data(res).capabilities.includes('vision'));
  });
});

describe('capability declaration', () => {
  it('normalizes bare ids into required capabilities', async () => {
    const res = await publish('bare-ids', ['vision', 'Tool Use']);
    assert.equal(res.status, 201);
    assert.deepEqual(data(res).skill.spec.capabilities, [
      { id: 'vision', level: 'required' },
      { id: 'tool-use', level: 'required' },
    ]);
  });

  it('keeps notes and preferred levels', async () => {
    const res = await publish('with-notes', [
      { id: 'long-context', level: 'preferred', note: 'reads whole files' },
    ]);
    assert.deepEqual(data(res).skill.spec.capabilities, [
      { id: 'long-context', level: 'preferred', note: 'reads whole files' },
    ]);
  });

  it('hoists capabilities to the top level of the stored skill', async () => {
    await publish('hoisted', ['vision']);
    const listed = await call(env, 'GET', '/api/skills');
    const skill = data(listed).skills.find((s) => s.id === '@alice/hoisted');
    assert.deepEqual(skill.capabilities, [{ id: 'vision', level: 'required' }]);
  });

  it('writes the contract into the markdown artifact', async () => {
    const res = await publish('documented', [{ id: 'vision', level: 'required', note: 'reads charts' }]);
    const { markdown } = data(res).skill;
    assert.match(markdown, /## Required capabilities/);
    assert.match(markdown, /`vision` \(required\) — reads charts/);
  });

  it('refuses a capability entry with no id', async () => {
    const res = await call(env, 'POST', '/api/skills', {
      token: alice,
      body: { id: 'bad', spec: { ...spec('bad'), capabilities: [{ level: 'required' }] } },
    });
    assert.equal(res.status, 400);
    assert.equal(error(res).code, 'VALIDATION_SKILL_SPEC_INVALID');
  });

  it('survives an update round trip', async () => {
    await publish('updatable', ['vision']);
    const res = await call(env, 'PATCH', '/api/skills/%40alice%2Fupdatable', {
      token: alice,
      body: { spec: spec('updatable', [{ id: 'tool-use', level: 'preferred' }]) },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(data(res).skill.capabilities, [{ id: 'tool-use', level: 'preferred' }]);
  });
});

describe('execution gate', () => {
  it('runs a skill the runtime satisfies', async () => {
    await publish('plain', ['structured-output']);
    const res = await call(env, 'POST', '/api/skills/%40alice%2Fplain/execute', {
      token: alice,
      body: { input: 'hello' },
    });
    assert.equal(res.status, 200);
    assert.equal(data(res).response, 'executed');
    assert.equal(data(res).degraded, false);
    assert.equal(data(res).capabilityReport.satisfied, true);
  });

  it('refuses a run when a required capability is unavailable', async () => {
    await publish('needs-vision', ['vision']);
    const res = await call(env, 'POST', '/api/skills/%40alice%2Fneeds-vision/execute', {
      token: alice,
      body: { input: 'describe this chart' },
    });
    assert.equal(res.status, 422);
    assert.equal(error(res).code, 'SKILL_CAPABILITY_UNSUPPORTED');
    assert.deepEqual(
      error(res).detail.capabilityReport.missingRequired.map((c) => c.id),
      ['vision'],
    );
  });

  it('runs anyway when the caller forces it, and says the run is degraded', async () => {
    await publish('forced', ['vision']);
    const res = await call(env, 'POST', '/api/skills/%40alice%2Fforced/execute', {
      token: alice,
      body: { input: 'describe this chart', force: true },
    });
    assert.equal(res.status, 200);
    assert.equal(data(res).degraded, true);
    assert.ok(data(res).trace.some((entry) => entry.status === 'error'));
  });

  it('runs a skill missing only a preferred capability, and marks the trace', async () => {
    await publish('prefers-tools', [{ id: 'tool-use', level: 'preferred' }]);
    const res = await call(env, 'POST', '/api/skills/%40alice%2Fprefers-tools/execute', {
      token: alice,
      body: { input: 'go' },
    });
    assert.equal(res.status, 200);
    assert.equal(data(res).degraded, false);
    assert.ok(data(res).trace.some((entry) => /preferred/i.test(entry.label)));
  });

  it('gates on the spec sent with the request, not just the stored one', async () => {
    await publish('draft-gate', []);
    const res = await call(env, 'POST', '/api/skills/%40alice%2Fdraft-gate/execute', {
      token: alice,
      body: { input: 'go', spec: spec('draft-gate', ['computer-use']) },
    });
    assert.equal(res.status, 422);
    assert.equal(error(res).code, 'SKILL_CAPABILITY_UNSUPPORTED');
  });
});

describe('agent operations', () => {
  it('applies set_capabilities and append_capability through a builder turn', async () => {
    const created = await call(env, 'POST', '/api/skill-builder/session', {
      token: alice,
      body: { initialSpec: spec('agent-driven') },
    });
    const sessionId = data(created).session.id;

    env.AI = {
      run: async () => ({
        response: JSON.stringify({
          operations: [
            { type: 'set_capabilities', value: [{ id: 'tool-use', level: 'required' }] },
            { type: 'append_capability', value: { id: 'long-context', level: 'preferred' } },
          ],
          message: 'Declared the capability contract.',
        }),
      }),
    };

    const turn = await call(env, 'POST', `/api/skill-builder/session/${sessionId}`, {
      token: alice,
      body: { intent: 'declare capabilities', currentSpec: spec('agent-driven') },
    });

    assert.equal(turn.status, 200);
    assert.deepEqual(data(turn).spec.capabilities, [
      { id: 'tool-use', level: 'required' },
      { id: 'long-context', level: 'preferred' },
    ]);
  });
});
