import { describe, it, expect } from 'vitest';
// Pure ESM module shared by the backfill script (repo-root scripts/).
import {
  nameTokens,
  isMalformedId,
  isDistinctiveName,
  detectDependencies,
  classifySkill,
  classifyRegistry,
  buildIndex,
  CURATED_OVERRIDES,
} from '../../../scripts/lib/detect-meta.mjs';

type AnySkill = Record<string, unknown>;

// A small registry mirroring the real findings (orchestrators + their deps + noise).
const skills: AnySkill[] = [
  { id: '@dmz_agent/turing-iterator', name: 'TuringIterator', authorHandle: 'dmz_agent', description: 'Orchestrates the Diary, Present, and Roadmap skills into a loop.', tags: ['meta-skill'], spec: { instructions: ['Run the Present skill, then Roadmap.'] }, markdown: 'Orchestrates Diary, Present, Roadmap.' },
  { id: '@dmz_agent/diary', name: 'Diary', authorHandle: 'dmz_agent', description: 'Keeps a diary.', markdown: 'Diary skill.' },
  { id: '@dmz_agent/present', name: 'Present', authorHandle: 'dmz_agent', description: 'Summarizes the present.', markdown: 'Present skill.' },
  { id: '@dmz_agent/roadmap', name: 'Roadmap', authorHandle: 'dmz_agent', description: 'Plans a roadmap.', markdown: 'Roadmap skill.' },

  { id: '@design_seeder/typography-system-builder', name: 'TypographySystemBuilder', authorHandle: 'design_seeder', description: 'Builds type systems.', markdown: 'Type scale.' },
  // Non-curated meta skill that references a real skill by distinctive name + meta language.
  { id: '@design_seeder/marketing-kit', name: 'Marketing Kit', authorHandle: 'design_seeder', description: 'Composes brand skills together.', spec: { instructions: ['Embed TypographySystemBuilder output for type.'] }, markdown: 'Uses TypographySystemBuilder.', tags: ['bundle'] },
  // References another skill by full id → strongest signal.
  { id: '@design_seeder/explicit-ref', name: 'Explicit Ref', authorHandle: 'design_seeder', description: 'See @design_seeder/typography-system-builder for types.', markdown: 'install @design_seeder/typography-system-builder' },

  // Meta language but only invented (non-registry) skill names → meta-no-deps.
  { id: '@ess_seeder/generic-orchestrator', name: 'Generic Orchestrator', authorHandle: 'ess_seeder', description: 'Orchestrates whatever sub-skills you pass in, like ResearchSummarizer.', tags: ['meta-skill'], markdown: 'Pipeline of skills.' },
  // Plain standalone skill — no references.
  { id: '@ess_seeder/lonely', name: 'Lonely', authorHandle: 'ess_seeder', description: 'Does one small thing.', markdown: 'Standalone.' },

  // Curated skill-composer + its real deps.
  { id: '@ess_seeder/skill-composer', name: 'SkillComposer', authorHandle: 'ess_seeder', description: 'Unlike SequentialPipeline or ParallelSwarm, composes dynamically.', markdown: 'composer' },
  { id: '@ess_seeder/sequential-pipeline', name: 'SequentialPipeline', authorHandle: 'ess_seeder', description: 'Runs skills in order.', markdown: 'seq' },
  { id: '@ess_seeder/parallel-swarm', name: 'ParallelSwarm', authorHandle: 'ess_seeder', description: 'Fans out skills.', markdown: 'par' },

  // Malformed test artifact — must be ignored entirely.
  { id: '@ess_seeder/@ess_seeder/skill-router-test', name: 'Router Test', authorHandle: 'ess_seeder', markdown: 'mentions Diary' },
];

describe('detect-meta helpers', () => {
  it('tokenizes camelCase and spaced names', () => {
    expect(nameTokens('TypographySystemBuilder')).toEqual(['typography', 'system', 'builder']);
    expect(nameTokens('Brand Style Guide')).toEqual(['brand', 'style', 'guide']);
  });

  it('flags malformed (doubled-handle) ids', () => {
    expect(isMalformedId('@ess_seeder/@ess_seeder/x')).toBe(true);
    expect(isMalformedId('@ess_seeder/ok')).toBe(false);
  });

  it('treats multi-word / camelCase names as distinctive but not short common words', () => {
    expect(isDistinctiveName('TypographySystemBuilder')).toBe(true);
    expect(isDistinctiveName('Present')).toBe(false); // 7 chars, single common-ish word
    expect(isDistinctiveName('Diary')).toBe(false); // < 6 chars
  });
});

describe('detectDependencies', () => {
  const index = buildIndex(skills);

  it('finds an explicit full-id reference (strongest signal)', () => {
    const skill = skills.find((s) => s.id === '@design_seeder/explicit-ref')!;
    const deps = detectDependencies(skill, index);
    const hit = deps.find((d: AnySkill) => d.id === '@design_seeder/typography-system-builder');
    expect(hit).toBeTruthy();
    expect(['id', 'install']).toContain(hit!.signal);
    expect(hit!.strength).toBe(3);
  });

  it('finds a distinctive name reference', () => {
    const skill = skills.find((s) => s.id === '@design_seeder/marketing-kit')!;
    const deps = detectDependencies(skill, index);
    expect(deps.map((d: AnySkill) => d.id)).toContain('@design_seeder/typography-system-builder');
  });

  it('excludes self-references and malformed ids', () => {
    const tib = skills.find((s) => s.id === '@dmz_agent/turing-iterator')!;
    const deps = detectDependencies(tib, index);
    expect(deps.every((d: AnySkill) => d.id !== '@dmz_agent/turing-iterator')).toBe(true);
    // The malformed router-test skill is never offered as a dependency target.
    expect(deps.every((d: AnySkill) => !String(d.id).includes('@ess_seeder/@ess_seeder'))).toBe(true);
  });
});

describe('classifySkill', () => {
  const index = buildIndex(skills);

  it('applies curated overrides verbatim (even for non-distinctive names)', () => {
    const tib = skills.find((s) => s.id === '@dmz_agent/turing-iterator')!;
    const r = classifySkill(tib, index);
    expect(r.confidence).toBe('curated');
    expect(r.dependencies.sort()).toEqual(['@dmz_agent/diary', '@dmz_agent/present', '@dmz_agent/roadmap']);
    expect(r.missingCurated).toEqual([]);
  });

  it('drops curated deps that are not in the registry (missingCurated)', () => {
    const partial = buildIndex(skills.filter((s) => s.id !== '@dmz_agent/roadmap'));
    const tib = skills.find((s) => s.id === '@dmz_agent/turing-iterator')!;
    const r = classifySkill(tib, partial);
    expect(r.dependencies).not.toContain('@dmz_agent/roadmap');
    expect(r.missingCurated).toContain('@dmz_agent/roadmap');
  });

  it('rates an id-reference as high confidence', () => {
    const skill = skills.find((s) => s.id === '@design_seeder/explicit-ref')!;
    const r = classifySkill(skill, index);
    expect(r.confidence).toBe('high');
    expect(r.isMeta).toBe(true);
  });

  it('rates a name reference with meta language as high', () => {
    const skill = skills.find((s) => s.id === '@design_seeder/marketing-kit')!;
    const r = classifySkill(skill, index);
    expect(r.confidence).toBe('high'); // name (strength 2) + meta-language tag
  });

  it('flags meta language with no real deps as meta-no-deps', () => {
    const skill = skills.find((s) => s.id === '@ess_seeder/generic-orchestrator')!;
    const r = classifySkill(skill, index);
    expect(r.dependencies).toEqual([]);
    expect(r.confidence).toBe('meta-no-deps');
  });

  it('classifies a plain skill as none', () => {
    const skill = skills.find((s) => s.id === '@ess_seeder/lonely')!;
    const r = classifySkill(skill, index);
    expect(r.confidence).toBe('none');
    expect(r.isMeta).toBe(false);
  });
});

describe('classifyRegistry', () => {
  it('returns ranked candidates (curated first) and the three known orchestrators', () => {
    const { results } = classifyRegistry(skills);
    const ids = results.map((r: AnySkill) => r.id);
    expect(ids).toContain('@dmz_agent/turing-iterator');
    expect(ids).toContain('@ess_seeder/skill-composer');
    expect(ids).toContain('@design_seeder/marketing-kit');
    // curated entries rank ahead of detected ones.
    const firstDetectedIdx = results.findIndex((r: AnySkill) => r.source === 'detected');
    const lastCuratedIdx = results.map((r: AnySkill) => r.source).lastIndexOf('curated');
    expect(lastCuratedIdx).toBeLessThan(firstDetectedIdx);
    // the lonely skill is not a candidate.
    expect(ids).not.toContain('@ess_seeder/lonely');
  });

  it('CURATED_OVERRIDES covers the three confirmed skills', () => {
    expect(Object.keys(CURATED_OVERRIDES).sort()).toEqual([
      '@design_seeder/brand-style-guide-generator',
      '@dmz_agent/turing-iterator',
      '@ess_seeder/skill-composer',
    ]);
  });
});
