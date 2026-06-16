import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runGenerate, buildMetaIntent } from '../dist/generate.js';

// A registry of existing skills the generator can bundle as dependencies.
const EXISTING = [
  { id: '@me/alpha', name: 'Alpha', description: 'a', category: 'Data', tags: [], markdown: 'a', version: 1, downloads: 0 },
  { id: '@me/beta', name: 'Beta', description: 'b', category: 'Data', tags: [], markdown: 'b', version: 1, downloads: 0 },
  { id: '@me/gamma', name: 'Gamma', description: 'g', category: 'Data', tags: [], markdown: 'g', version: 1, downloads: 0 },
];

// A fully-valid invented spec the mocked Skill Architect "returns".
const INVENTED_SPEC = {
  name: 'Orchestrator X',
  description: 'Bundles things into a workflow.',
  category: 'Automation',
  tags: ['workflow'],
  purpose: 'Coordinate several skills end to end.',
  instructions: ['Run the first skill', 'Hand off to the next'],
  promptTemplate: 'Use {{input}} to drive the workflow.',
  examples: [{ title: 'e', input: 'i', output: 'o' }],
  tests: [{ name: 't', input: 'i', expected: 'e' }],
};

function stubFetch(existing: typeof EXISTING) {
  const json = (data: unknown) => ({ ok: true, json: async () => ({ ok: true, data }) });
  (globalThis as { fetch: unknown }).fetch = async (url: string) => {
    const u = String(url);
    if (u.includes('/skill-builder/session/')) return json({ sessionId: 'sess1', spec: INVENTED_SPEC, artifacts: { markdown: '# Orchestrator X' } });
    if (u.includes('/skill-builder/session')) return json({ session: { id: 'sess1', spec: {} } });
    if (u.includes('/skills')) return json({ skills: existing, total: existing.length, page: 1, pageSize: 100 });
    return json(null);
  };
}

let tmp: string;
let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-gen-'));
  realFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function readManifest(): Record<string, unknown> {
  const file = fs.readdirSync(tmp).find((f) => f.endsWith('.json'))!;
  return JSON.parse(fs.readFileSync(path.join(tmp, file), 'utf-8'));
}

describe('runGenerate meta mode', () => {
  it('invents a meta skill whose dependencies are 2-4 real, fully-qualified existing skills', async () => {
    stubFetch(EXISTING);
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 1, backend: 'registry', log: () => {} });

    expect(result.saved).toBe(1);
    const manifest = readManifest();
    expect(manifest.type).toBe('meta');

    const deps = manifest.dependencies as string[];
    expect(deps.length).toBeGreaterThanOrEqual(2);
    expect(deps.length).toBeLessThanOrEqual(4);
    const existingIds = EXISTING.map((s) => s.id);
    // Every dependency is a real existing id (never invented) and fully qualified.
    for (const d of deps) {
      expect(d.startsWith('@')).toBe(true);
      expect(existingIds).toContain(d);
    }
    // Deduped.
    expect(new Set(deps).size).toBe(deps.length);
    // Generated markdown advertises the bundle.
    expect(String(manifest.markdown)).toContain('Dependencies');
  });

  it('falls back to a basic skill when fewer than two skills exist to bundle', async () => {
    stubFetch([EXISTING[0]]);
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 1, backend: 'registry', log: () => {} });

    expect(result.saved).toBe(1);
    const manifest = readManifest();
    expect(manifest.type).toBe('basic');
    expect(manifest.dependencies).toEqual([]);
  });

  it('metaRatio 0 never produces a meta skill even with skills available', async () => {
    stubFetch(EXISTING);
    await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 0, backend: 'registry', log: () => {} });
    expect(readManifest().type).toBe('basic');
  });
});

type Captured = { body?: Record<string, unknown> };

function stubAnthropic(existing: typeof EXISTING, cap: Captured, mode: 'tool' | 'text' = 'tool') {
  (globalThis as { fetch: unknown }).fetch = async (url: string, opts: { body?: string } = {}) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      cap.body = JSON.parse(opts.body || '{}');
      const content = mode === 'tool'
        ? [{ type: 'tool_use', name: 'submit_skill', input: INVENTED_SPEC }]
        : [{ type: 'text', text: 'Here is the skill:\n' + JSON.stringify(INVENTED_SPEC) + '\nDone.' }];
      return { ok: true, status: 200, json: async () => ({ content }) };
    }
    // Registry list endpoint (used for de-duplication) keeps the {ok,data} wrapper.
    return { ok: true, json: async () => ({ ok: true, data: { skills: existing, total: existing.length, page: 1, pageSize: 100 } }) };
  };
}

describe('runGenerate anthropic backend (Opus 4.8, high effort)', () => {
  it('invents via Claude Opus 4.8 at high reasoning effort and saves the spec', async () => {
    const cap: Captured = {};
    stubAnthropic(EXISTING, cap);
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, backend: 'anthropic', anthropicApiKey: 'sk-test', log: () => {} });

    expect(result.saved).toBe(1);
    expect(readManifest().name).toBe('Orchestrator X');
    // The request used the requested model + reasoning effort and offered the tool.
    expect(cap.body?.model).toBe('claude-opus-4-8');
    expect((cap.body?.output_config as { effort?: string })?.effort).toBe('high');
    expect((cap.body?.tool_choice as { type?: string })?.type).toBe('auto');
    expect((cap.body?.tools as Array<{ name: string }>)[0].name).toBe('submit_skill');
  });

  it('honours an explicit model + effort override', async () => {
    const cap: Captured = {};
    stubAnthropic(EXISTING, cap);
    await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, backend: 'anthropic', anthropicApiKey: 'sk-test', model: 'claude-opus-4-8', effort: 'xhigh', log: () => {} });
    expect((cap.body?.output_config as { effort?: string })?.effort).toBe('xhigh');
  });

  it('falls back to parsing JSON from text when no tool call is returned', async () => {
    const cap: Captured = {};
    stubAnthropic(EXISTING, cap, 'text');
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, backend: 'anthropic', anthropicApiKey: 'sk-test', log: () => {} });
    expect(result.saved).toBe(1);
    expect(readManifest().name).toBe('Orchestrator X');
  });

  it('throws a clear error when the API key is missing', async () => {
    stubAnthropic(EXISTING, {});
    await expect(
      runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, backend: 'anthropic', log: () => {} }),
    ).rejects.toThrow(/API key/i);
  });
});

describe('buildMetaIntent', () => {
  it('lists the chosen dependencies by name and id and frames it as a meta skill', () => {
    const intent = buildMetaIntent('data analysis', [
      { id: '@me/alpha', name: 'Alpha' },
      { id: '@me/beta', name: 'Beta' },
    ]);
    expect(intent).toMatch(/META-skill/i);
    expect(intent).toContain('Alpha (@me/alpha)');
    expect(intent).toContain('Beta (@me/beta)');
  });
});
