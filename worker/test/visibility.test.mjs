// Visibility enforcement for the registry worker — the whole HTTP surface,
// run in-process against a Map-backed KV stub (node --test, zero deps).
//
// The contract under test: 'public' is world-readable; 'draft' and 'private'
// are owner-only on EVERY read path (list, fetch, suggest, taxonomy, fork,
// execute), masked as 404 so existence never leaks; junk visibility values
// are refused at every write path and treated as owner-only if ever stored;
// and a publish carrying source 'dmzagent-orchestration' lands private —
// public is an explicit act through the visibility endpoint, refused as a
// publish side effect.
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
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '' } = {}) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

const AI = { run: async () => ({ response: 'ok' }) };

function seedUser(kv, handle) {
  const email = `${handle}@example.test`;
  kv.store.set(
    `users/${email}`,
    JSON.stringify({ id: `id-${handle}`, name: handle, handle, email, createdAt: '2026-01-01T00:00:00Z' }),
  );
  kv.store.set(`handles/${handle}`, email);
  kv.store.set(`tokens/tok-${handle}`, email);
  return `tok-${handle}`;
}

function spec(name) {
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
  };
}

async function call(env, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request(`https://skills.dmzagent.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await worker.fetch(request, env);
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
}

// The worker wraps payloads as { ok, data } or { ok:false, error } — unwrap
// tolerantly so the tests read at the domain level.
function data(res) {
  return res.body?.data ?? res.body;
}

let env;
let alice;
let bob;

beforeEach(() => {
  const SKILL_STORE = makeKV();
  env = { SKILL_STORE, AI };
  alice = seedUser(SKILL_STORE, 'alice');
  bob = seedUser(SKILL_STORE, 'bob');
});

async function publish(token, id, extra = {}) {
  return call(env, 'POST', '/api/skills', {
    token,
    body: { id, spec: spec(id), ...extra },
  });
}

describe('publish defaults', () => {
  it('community publish defaults public', async () => {
    const res = await publish(alice, 'community-skill');
    assert.equal(res.status, 201);
    assert.equal(data(res).skill.visibility, 'public');
  });

  it('orchestration publish defaults private and records its source', async () => {
    const res = await publish(alice, 'orch-skill', { source: 'dmzagent-orchestration' });
    assert.equal(res.status, 201);
    assert.equal(data(res).skill.visibility, 'private');
    assert.equal(data(res).skill.source, 'dmzagent-orchestration');
  });

  it('orchestration publish refuses explicit public — going public is a separate act', async () => {
    const res = await publish(alice, 'orch-public', {
      source: 'dmzagent-orchestration',
      visibility: 'public',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body?.error?.code, 'VALIDATION_ORCHESTRATION_PRIVATE');
  });

  it('orchestration publish may still choose draft explicitly', async () => {
    const res = await publish(alice, 'orch-draft', {
      source: 'dmzagent-orchestration',
      visibility: 'draft',
    });
    assert.equal(res.status, 201);
    assert.equal(data(res).skill.visibility, 'draft');
  });

  it('junk visibility on publish is refused, not stored', async () => {
    const res = await publish(alice, 'junk-vis', { visibility: 'banana' });
    assert.equal(res.status, 400);
  });
});

describe('read gates', () => {
  let privateId;

  beforeEach(async () => {
    const res = await publish(alice, 'secret-skill', { source: 'dmzagent-orchestration' });
    privateId = data(res).skill.id; // '@alice/secret-skill'
    await publish(alice, 'open-skill');
  });

  it('owner fetches their private skill', async () => {
    const res = await call(env, 'GET', `/api/skills/${encodeURIComponent(privateId)}`, { token: alice });
    assert.equal(res.status, 200);
  });

  it('another user gets a masked 404 for it', async () => {
    const res = await call(env, 'GET', `/api/skills/${encodeURIComponent(privateId)}`, { token: bob });
    assert.equal(res.status, 404);
  });

  it('anonymous gets a masked 404 for it', async () => {
    const res = await call(env, 'GET', `/api/skills/${encodeURIComponent(privateId)}`);
    assert.equal(res.status, 404);
  });

  it('the list excludes it for others and includes it for the owner', async () => {
    const forBob = data(await call(env, 'GET', '/api/skills', { token: bob }));
    assert.ok(!forBob.skills.some((s) => s.id === privateId));
    const forAlice = data(await call(env, 'GET', '/api/skills', { token: alice }));
    assert.ok(forAlice.skills.some((s) => s.id === privateId));
  });

  it('the filtered list path enforces it too', async () => {
    const forBob = data(await call(env, 'GET', '/api/skills?query=secret', { token: bob }));
    assert.ok(!forBob.skills.some((s) => s.id === privateId));
  });

  it('suggest never surfaces it to others', async () => {
    const res = data(await call(env, 'GET', '/api/skills/suggest?q=secret', { token: bob }));
    assert.ok(!res.suggestions.some((s) => s.kind === 'skill' && s.value === privateId));
  });

  it('fork of a private skill is owner-only, masked', async () => {
    const res = await call(env, 'POST', `/api/skills/${encodeURIComponent(privateId)}/fork`, {
      token: bob,
      body: { id: 'stolen' },
    });
    assert.equal(res.status, 404);
  });

  it('execute of a private skill is owner-only, masked', async () => {
    const res = await call(env, 'POST', `/api/skills/${encodeURIComponent(privateId)}/execute`, {
      token: bob,
      body: { input: 'hi' },
    });
    assert.equal(res.status, 404);
  });

  it('the owner can still execute it', async () => {
    const res = await call(env, 'POST', `/api/skills/${encodeURIComponent(privateId)}/execute`, {
      token: alice,
      body: { input: 'hi' },
    });
    assert.equal(res.status, 200);
  });

  it('a stored junk visibility value reads as owner-only, never public', async () => {
    const raw = JSON.parse(env.SKILL_STORE.store.get(`skills/${privateId}`));
    raw.visibility = 'banana';
    env.SKILL_STORE.store.set(`skills/${privateId}`, JSON.stringify(raw));
    const res = await call(env, 'GET', `/api/skills/${encodeURIComponent(privateId)}`, { token: bob });
    assert.equal(res.status, 404);
  });

  it('a legacy row with no visibility field stays public', async () => {
    const raw = JSON.parse(env.SKILL_STORE.store.get(`skills/@alice/open-skill`));
    delete raw.visibility;
    env.SKILL_STORE.store.set('skills/@alice/open-skill', JSON.stringify(raw));
    const res = await call(env, 'GET', '/api/skills/%40alice%2Fopen-skill', { token: bob });
    assert.equal(res.status, 200);
  });
});

describe('the explicit act of going public', () => {
  it('the owner flips a private skill public through the visibility endpoint', async () => {
    const created = await publish(alice, 'flip-me', { source: 'dmzagent-orchestration' });
    const id = data(created).skill.id;
    const flip = await call(env, 'PATCH', `/api/skills/${encodeURIComponent(id)}/visibility`, {
      token: alice,
      body: { visibility: 'public' },
    });
    assert.equal(flip.status, 200);
    assert.equal(data(flip).skill.visibility, 'public');
    const asBob = await call(env, 'GET', `/api/skills/${encodeURIComponent(id)}`, { token: bob });
    assert.equal(asBob.status, 200);
  });

  it('only the owner may flip it', async () => {
    const created = await publish(alice, 'not-yours', { source: 'dmzagent-orchestration' });
    const id = data(created).skill.id;
    const flip = await call(env, 'PATCH', `/api/skills/${encodeURIComponent(id)}/visibility`, {
      token: bob,
      body: { visibility: 'public' },
    });
    // Masked or forbidden are both acceptable refusals; success is not.
    assert.ok([403, 404].includes(flip.status));
  });

  it('the visibility endpoint accepts private and refuses junk', async () => {
    const created = await publish(alice, 'tighten-me');
    const id = data(created).skill.id;
    const toPrivate = await call(env, 'PATCH', `/api/skills/${encodeURIComponent(id)}/visibility`, {
      token: alice,
      body: { visibility: 'private' },
    });
    assert.equal(toPrivate.status, 200);
    assert.equal(data(toPrivate).skill.visibility, 'private');
    const junk = await call(env, 'PATCH', `/api/skills/${encodeURIComponent(id)}/visibility`, {
      token: alice,
      body: { visibility: 'sneaky' },
    });
    assert.equal(junk.status, 400);
  });

  it('the general update endpoint refuses junk visibility too', async () => {
    const created = await publish(alice, 'patch-me');
    const id = data(created).skill.id;
    const res = await call(env, 'PATCH', `/api/skills/${encodeURIComponent(id)}`, {
      token: alice,
      body: { visibility: 'banana' },
    });
    assert.equal(res.status, 400);
  });
});
