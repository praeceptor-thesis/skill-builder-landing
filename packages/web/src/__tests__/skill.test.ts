import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_CATALOG,
  checkCapabilities,
  normalizeCapabilities,
  runtimeProfile,
  toCapabilityId,
} from '../skill/capabilities';
import { buildSkillGraph, layoutSkillGraph } from '../skill/graph';
import {
  checkOutput,
  extractTemplateVariables,
  renderTemplate,
  runTranscript,
  summarizeRuns,
  unfilledVariables,
  type InvocationRun,
} from '../skill/invocation';
import {
  applySkillOperationsToSpec,
  createEmptySkillSpec,
  normalizeSkillSpec,
  specFromMarkdown,
  specReadiness,
  specToMarkdown,
} from '../skill/spec';

describe('capabilities', () => {
  it('normalizes bare ids, records, and comma-separated text', () => {
    expect(normalizeCapabilities(['vision'])).toEqual([{ id: 'vision', level: 'required' }]);
    expect(normalizeCapabilities('tool-use, long-context')).toEqual([
      { id: 'tool-use', level: 'required' },
      { id: 'long-context', level: 'required' },
    ]);
    expect(normalizeCapabilities([{ id: 'Vision', requirement: 'optional', reason: 'reads charts' }])).toEqual([
      { id: 'vision', level: 'preferred', note: 'reads charts' },
    ]);
  });

  it('keeps the stricter level when a capability is declared twice', () => {
    expect(normalizeCapabilities([
      { id: 'tool-use', level: 'preferred' },
      { id: 'tool-use', level: 'required' },
    ])).toEqual([{ id: 'tool-use', level: 'required' }]);
  });

  it('preserves custom ids the catalog does not model', () => {
    expect(toCapabilityId('  Optical Character Recognition ')).toBe('optical-character-recognition');
    expect(normalizeCapabilities(['ocr'])).toEqual([{ id: 'ocr', level: 'required' }]);
  });

  it('drops entries with no id', () => {
    expect(normalizeCapabilities([{ level: 'required' }, '', '   '])).toEqual([]);
  });

  it('reports a required capability the runtime lacks as blocking', () => {
    const report = checkCapabilities(
      [{ id: 'vision', level: 'required' }, { id: 'streaming', level: 'preferred' }],
      runtimeProfile('preview-sandbox'),
    );
    expect(report.satisfied).toBe(false);
    expect(report.missingRequired.map((c) => c.id)).toEqual(['vision']);
    expect(report.missingPreferred).toEqual([]);
  });

  it('treats an unmet preferred capability as degraded, not blocked', () => {
    const report = checkCapabilities(
      [{ id: 'tool-use', level: 'preferred' }],
      runtimeProfile('preview-sandbox'),
    );
    expect(report.satisfied).toBe(true);
    expect(report.missingPreferred.map((c) => c.id)).toEqual(['tool-use']);
  });

  it('satisfies every catalogued capability on the richest profile', () => {
    const report = checkCapabilities(
      CAPABILITY_CATALOG.filter((c) => c.id !== 'computer-use').map((c) => ({ id: c.id, level: 'required' as const })),
      runtimeProfile('multimodal-agent'),
    );
    expect(report.satisfied).toBe(true);
  });
});

describe('spec', () => {
  it('classifies a skill with dependencies as meta whatever it claims', () => {
    const spec = normalizeSkillSpec({ ...createEmptySkillSpec(), type: 'basic', dependencies: ['@a/b'] });
    expect(spec.type).toBe('meta');
  });

  it('round-trips capabilities through the markdown artifact', () => {
    const spec = normalizeSkillSpec({
      ...createEmptySkillSpec(),
      name: 'Chart Reader',
      description: 'Reads charts.',
      purpose: 'Read charts.',
      instructions: ['Look at the chart'],
      promptTemplate: 'Chart: {{input}}',
      capabilities: [{ id: 'vision', level: 'required', note: 'reads chart images' }],
    });

    const markdown = specToMarkdown(spec);
    expect(markdown).toContain('## Required capabilities');
    expect(markdown).toContain('`vision` (required) — reads chart images');

    const parsed = specFromMarkdown(markdown, createEmptySkillSpec());
    expect(parsed.capabilities).toEqual([{ id: 'vision', level: 'required', note: 'reads chart images' }]);
  });

  it('applies capability operations from the agent', () => {
    const base = createEmptySkillSpec();
    const withCaps = applySkillOperationsToSpec(base, [
      { type: 'set_capabilities', value: [{ id: 'tool-use', level: 'required' }] },
      { type: 'append_capability', value: { id: 'long-context', level: 'preferred' } },
    ]);
    expect(withCaps.capabilities).toEqual([
      { id: 'tool-use', level: 'required' },
      { id: 'long-context', level: 'preferred' },
    ]);
  });

  it('keeps a titled but unfilled example so a new row survives editing', () => {
    const spec = normalizeSkillSpec({
      ...createEmptySkillSpec(),
      examples: [{ title: 'Example 1', input: '', output: '' }, {}],
    });
    expect(spec.examples).toEqual([{ title: 'Example 1', input: '', output: '' }]);
  });

  it('adds a dependency requirement to the checklist only for meta skills', () => {
    const basic = specReadiness(createEmptySkillSpec());
    expect(basic.requirements.some((r) => r.id === 'dependencies')).toBe(false);

    const meta = specReadiness(normalizeSkillSpec({ ...createEmptySkillSpec(), type: 'meta' }));
    expect(meta.requirements.some((r) => r.id === 'dependencies')).toBe(true);
  });
});

describe('graph', () => {
  const metaSpec = normalizeSkillSpec({
    ...createEmptySkillSpec(),
    name: 'Bundle',
    type: 'meta',
    dependencies: ['@a/one', '@a/two'],
    capabilities: [{ id: 'tool-use', level: 'required' }],
  });

  it('lays out the root and its dependencies in layers', () => {
    const graph = buildSkillGraph(metaSpec, [
      { id: '@a/one', name: 'One', dependencies: ['@a/deep'] },
      { id: '@a/two', name: 'Two' },
      { id: '@a/deep', name: 'Deep' },
    ]);

    expect(graph.layers).toHaveLength(3);
    expect(graph.layers[0].map((n) => n.label)).toEqual(['Bundle']);
    expect(graph.layers[1].map((n) => n.label)).toEqual(['One', 'Two']);
    expect(graph.installCount).toBe(3);
    expect(graph.unresolved).toEqual([]);
  });

  it('flags a dependency the registry could not resolve', () => {
    const graph = buildSkillGraph(metaSpec, [{ id: '@a/one', name: 'One' }]);
    expect(graph.unresolved).toEqual(['@a/two']);
    expect(graph.nodes.find((n) => n.id === '@a/two')?.missing).toBe(true);
  });

  it('detects a dependency cycle instead of looping forever', () => {
    const spec = normalizeSkillSpec({ ...createEmptySkillSpec(), name: 'Root', dependencies: ['@a/one'] });
    const graph = buildSkillGraph(spec, [
      { id: '@a/one', name: 'One', dependencies: ['@a/two'] },
      { id: '@a/two', name: 'Two', dependencies: ['@a/one'] },
    ]);

    expect(graph.cycles.length).toBeGreaterThan(0);
    expect(graph.edges.some((edge) => edge.cycle)).toBe(true);
  });

  it('rolls dependency capabilities up to the root', () => {
    const graph = buildSkillGraph(metaSpec, [
      { id: '@a/one', name: 'One', spec: { capabilities: [{ id: 'vision', level: 'required' }] } },
      { id: '@a/two', name: 'Two', spec: { capabilities: ['long-context'] } },
    ]);

    expect(graph.capabilityRollup.map((c) => c.id).sort()).toEqual(['long-context', 'tool-use', 'vision']);
  });

  it('produces a drawable layout with one path per edge', () => {
    const graph = buildSkillGraph(metaSpec, [{ id: '@a/one', name: 'One' }, { id: '@a/two', name: 'Two' }]);
    const layout = layoutSkillGraph(graph);
    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges.every((edge) => edge.path.startsWith('M '))).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
  });
});

describe('invocation', () => {
  const template = 'You are a skill.\n\nInput: {{input}}\nFormat: {{format}}\nAgain: {{format}}';

  it('extracts template variables and marks the primary input', () => {
    const variables = extractTemplateVariables(template);
    expect(variables).toEqual([
      { name: 'input', primary: true, occurrences: 1 },
      { name: 'format', primary: false, occurrences: 2 },
    ]);
  });

  it('renders filled variables and leaves gaps visible', () => {
    expect(renderTemplate(template, { format: 'json' })).toContain('Format: json');
    expect(renderTemplate(template, { format: 'json' })).toContain('{{input}}');
    expect(unfilledVariables(template, {})).toEqual(['format']);
  });

  it('scores output against an expectation', () => {
    expect(checkOutput('Hello world', 'hello   world').verdict).toBe('match');
    expect(checkOutput('the patient has a fever and a cough', 'patient fever cough').verdict).toBe('match');
    expect(checkOutput('completely different words here', 'alpha beta gamma delta').verdict).toBe('mismatch');
    expect(checkOutput('anything', '').verdict).toBe('unchecked');
    expect(checkOutput('', 'something').verdict).toBe('mismatch');
  });

  it('summarizes a batch of runs', () => {
    const run = (verdict: 'match' | 'close' | 'mismatch'): InvocationRun => ({
      id: verdict,
      source: { kind: 'manual' },
      input: 'in',
      variables: {},
      output: 'out',
      check: { verdict, similarity: 1, summary: '' },
      startedAt: new Date().toISOString(),
      durationMs: 1,
      profileId: 'preview-sandbox',
      degraded: false,
    });

    expect(summarizeRuns([run('match'), run('close'), run('mismatch')]))
      .toEqual({ total: 3, passed: 1, close: 1, failed: 1 });
  });

  it('writes a transcript the architect can act on', () => {
    const transcript = runTranscript({
      id: 'r1',
      source: { kind: 'test', index: 0, name: 'Handles empty input' },
      input: 'nothing',
      variables: { format: 'json' },
      expected: 'an empty object',
      output: 'null',
      check: { verdict: 'mismatch', similarity: 0, summary: 'Covers only 0% of the expected content.' },
      startedAt: new Date().toISOString(),
      durationMs: 12,
      profileId: 'preview-sandbox',
      degraded: true,
    });

    expect(transcript).toContain('Handles empty input');
    expect(transcript).toContain('unmet required capabilities');
    expect(transcript).toContain('- format: json');
    expect(transcript).toContain('Expected output:');
    expect(transcript).toContain('Automatic check: mismatch');
  });
});
