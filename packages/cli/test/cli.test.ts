import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Import the compiled output so module resolution matches the published package.
import { resolveInstallPlan, writeSkillForTool } from '../dist/install.js';
import { renderSkillTable, displayId, effectiveType } from '../dist/render.js';
import { loadSkillFromContent, qualifyDependencies } from '../dist/sync.js';

type AnySkill = Record<string, unknown>;

function fakeClient(db: Record<string, AnySkill>) {
  return {
    getSkill: async (id: string) => {
      if (!db[id]) throw new Error(`404 ${id}`);
      return { skill: db[id] };
    },
  };
}

const diamond: Record<string, AnySkill> = {
  '@me/meta': { id: '@me/meta', name: 'Meta', category: 'Developer Tools', type: 'meta', dependencies: ['@me/a', '@me/b'], markdown: 'meta\n', version: 1, downloads: 1, tags: [] },
  '@me/a': { id: '@me/a', name: 'A', category: 'Data', dependencies: ['@me/c'], markdown: 'a\n', version: 1, downloads: 1, tags: [] },
  '@me/b': { id: '@me/b', name: 'B', category: 'Data', dependencies: ['@me/c'], markdown: 'b\n', version: 1, downloads: 1, tags: [] },
  '@me/c': { id: '@me/c', name: 'C', category: 'Utilities', markdown: 'c\n', version: 1, downloads: 1, tags: [] },
};

describe('resolveInstallPlan', () => {
  it('dedupes a diamond and orders dependencies before dependents', async () => {
    const plan = await resolveInstallPlan(fakeClient(diamond) as never, '@me/meta');
    expect(plan.root.id).toBe('@me/meta');
    const ids = plan.deps.map((d: AnySkill) => d.id);
    expect([...ids].sort()).toEqual(['@me/a', '@me/b', '@me/c']);
    // c appears before a and b (its dependents).
    expect(ids.indexOf('@me/c')).toBeLessThan(ids.indexOf('@me/a'));
    expect(ids.indexOf('@me/c')).toBeLessThan(ids.indexOf('@me/b'));
    expect(plan.missing).toEqual([]);
  });

  it('reports unresolved dependencies as missing instead of throwing', async () => {
    const db = { '@me/meta': { id: '@me/meta', name: 'Meta', type: 'meta', dependencies: ['@me/gone'], markdown: 'm\n', version: 1, downloads: 0, tags: [] } };
    const plan = await resolveInstallPlan(fakeClient(db) as never, '@me/meta');
    expect(plan.deps).toEqual([]);
    expect(plan.missing).toEqual(['@me/gone']);
  });

  it('survives a dependency cycle', async () => {
    const cyclic = {
      '@me/x': { id: '@me/x', name: 'X', dependencies: ['@me/y'], markdown: 'x\n', version: 1, downloads: 0, tags: [] },
      '@me/y': { id: '@me/y', name: 'Y', dependencies: ['@me/x'], markdown: 'y\n', version: 1, downloads: 0, tags: [] },
    };
    const plan = await resolveInstallPlan(fakeClient(cyclic) as never, '@me/x');
    expect(plan.deps.map((d: AnySkill) => d.id)).toEqual(['@me/y']);
  });
});

describe('writeSkillForTool', () => {
  it('writes markdown + json (with type and dependencies) for the file tool', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
    writeSkillForTool(diamond['@me/meta'] as never, { tool: 'file', outputDir: dir, agentsFile: 'AGENTS.md' });
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'));
    expect(json.type).toBe('meta');
    expect(json.dependencies).toEqual(['@me/a', '@me/b']);
    expect(fs.existsSync(path.join(dir, 'meta.md'))).toBe(true);
  });
});

describe('render helpers', () => {
  it('classifies skills and renders an aligned table', () => {
    expect(effectiveType(diamond['@me/meta'] as never)).toBe('meta');
    expect(effectiveType(diamond['@me/c'] as never)).toBe('basic');
    expect(displayId({ id: 'foo', authorHandle: 'me' } as never)).toBe('@me/foo');
    const table = renderSkillTable(Object.values(diamond) as never);
    expect(table).toContain('TYPE');
    expect(table).toContain('@me/meta');
  });
});

describe('sync parsing', () => {
  it('parses type and dependencies from markdown front-matter', () => {
    const md = '---\nid: my-meta\nname: My Meta\ntype: meta\ndependencies: [@me/a, @me/b]\n---\n\n# My Meta\n\nDoes things.';
    const loaded = loadSkillFromContent('my-meta.md', md);
    expect(loaded.payload.type).toBe('meta');
    expect(loaded.payload.dependencies).toEqual(['@me/a', '@me/b']);
    expect(loaded.errors).toEqual([]);
  });

  it('infers meta type when dependencies are present in JSON', () => {
    const json = JSON.stringify({ id: 'bundle', name: 'Bundle', description: 'x', category: 'Utilities', dependencies: ['@me/a'], spec: { purpose: 'p', instructions: ['do'], promptTemplate: 't' } });
    const loaded = loadSkillFromContent('bundle.json', json);
    expect(loaded.payload.type).toBe('meta');
    expect(loaded.payload.dependencies).toEqual(['@me/a']);
  });

  it('flags a meta skill that declares no dependencies', () => {
    const md = '---\nid: bad\nname: Bad\ntype: meta\npurpose: p\ninstructions:\n  - do it\npromptTemplate: t\n---\n\n# Bad';
    const loaded = loadSkillFromContent('bad.md', md);
    expect(loaded.errors.join(' ')).toMatch(/meta skill must list at least one dependency/i);
  });
});

describe('qualifyDependencies', () => {
  it('scopes bare ids to the owner handle', () => {
    expect(qualifyDependencies(['skill-a', 'skill-b'], 'me')).toEqual(['@me/skill-a', '@me/skill-b']);
  });

  it('preserves already-scoped (incl. cross-org) ids', () => {
    expect(qualifyDependencies(['@other/skill-a', 'skill-b'], 'me')).toEqual(['@other/skill-a', '@me/skill-b']);
  });

  it('dedupes after qualification and ignores blanks', () => {
    expect(qualifyDependencies(['skill-a', '@me/skill-a', '  ', 'skill-a'], 'me')).toEqual(['@me/skill-a']);
  });
});
