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
  (globalThis as { fetch: unknown }).fetch = async (url: string, opts: { method?: string } = {}) => {
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
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 1, log: () => {} });

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
    const result = await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 1, log: () => {} });

    expect(result.saved).toBe(1);
    const manifest = readManifest();
    expect(manifest.type).toBe('basic');
    expect(manifest.dependencies).toEqual([]);
  });

  it('metaRatio 0 never produces a meta skill even with skills available', async () => {
    stubFetch(EXISTING);
    await runGenerate({ registry: 'https://x/api', count: 1, publish: false, outDir: tmp, metaRatio: 0, log: () => {} });
    expect(readManifest().type).toBe('basic');
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
