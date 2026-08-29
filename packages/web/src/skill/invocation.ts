/**
 * Invocation support for the preview pane.
 *
 * A skill is only as good as what it emits, so the studio runs it for real and
 * lets the author (or the agent) check the result against what the spec says
 * should come back.
 */

import type { SkillSpec, SkillTest } from './spec';

export type TemplateVariable = {
  name: string;
  /** `{{input}}` is the invocation payload itself, not a settable knob. */
  primary: boolean;
  occurrences: number;
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Every `{{placeholder}}` in the prompt template, in first-appearance order. */
export function extractTemplateVariables(promptTemplate: string): TemplateVariable[] {
  const counts = new Map<string, number>();
  for (const match of promptTemplate.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, occurrences]) => ({
    name,
    primary: name === 'input',
    occurrences,
  }));
}

/** Fill a template. Unknown placeholders are left intact so gaps stay visible. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (match, name: string) => {
    const value = variables[name];
    return value === undefined || value === '' ? match : value;
  });
}

/** Placeholders with no value yet — the preflight warns about these. */
export function unfilledVariables(template: string, variables: Record<string, string>): string[] {
  return extractTemplateVariables(template)
    .filter((variable) => !variable.primary && !variables[variable.name]?.trim())
    .map((variable) => variable.name);
}

// ---------------------------------------------------------------------------
// Output checking
// ---------------------------------------------------------------------------

export type OutputVerdict = 'match' | 'close' | 'mismatch' | 'unchecked';

export type OutputCheck = {
  verdict: OutputVerdict;
  /** Token overlap between actual and expected, 0–1. */
  similarity: number;
  summary: string;
};

const tokenize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Compare an actual output against the expectation recorded in the spec.
 *
 * A generative skill rarely reproduces an expectation verbatim, so an exact
 * match is not the bar: this reports a similarity score and a three-way verdict
 * and leaves the judgement to the author, who can also hand the run to the
 * architect for a written review.
 */
export function checkOutput(actual: string, expected: string): OutputCheck {
  if (!expected.trim()) {
    return { verdict: 'unchecked', similarity: 0, summary: 'No expectation recorded for this run.' };
  }
  if (!actual.trim()) {
    return { verdict: 'mismatch', similarity: 0, summary: 'The skill returned nothing.' };
  }

  if (normalizeWhitespace(actual) === normalizeWhitespace(expected)) {
    return { verdict: 'match', similarity: 1, summary: 'Output matches the expectation exactly.' };
  }

  const actualTokens = new Set(tokenize(actual));
  const expectedTokens = tokenize(expected);
  if (expectedTokens.length === 0) {
    return { verdict: 'unchecked', similarity: 0, summary: 'The expectation has no comparable content.' };
  }

  const hits = expectedTokens.filter((token) => actualTokens.has(token)).length;
  const similarity = hits / expectedTokens.length;
  const percent = Math.round(similarity * 100);

  if (similarity >= 0.8) {
    return { verdict: 'match', similarity, summary: `Covers ${percent}% of the expected content.` };
  }
  if (similarity >= 0.45) {
    return { verdict: 'close', similarity, summary: `Covers ${percent}% of the expected content — review it.` };
  }
  return { verdict: 'mismatch', similarity, summary: `Covers only ${percent}% of the expected content.` };
}

export type RunSource =
  | { kind: 'manual' }
  | { kind: 'example'; index: number; title: string }
  | { kind: 'test'; index: number; name: string }
  | { kind: 'agent'; reason: string };

export type InvocationRun = {
  id: string;
  source: RunSource;
  input: string;
  variables: Record<string, string>;
  expected?: string;
  output: string;
  error?: string;
  check: OutputCheck;
  startedAt: string;
  durationMs: number;
  profileId: string;
  /** Set when the run went ahead with an unmet required capability. */
  degraded: boolean;
};

export const runSourceLabel = (source: RunSource): string => {
  switch (source.kind) {
    case 'example':
      return source.title || `Example ${source.index + 1}`;
    case 'test':
      return source.name || `Test ${source.index + 1}`;
    case 'agent':
      return 'Agent invocation';
    default:
      return 'Manual run';
  }
};

/** Roll a batch of test runs up into a single pass/fail line. */
export function summarizeRuns(runs: InvocationRun[]) {
  const passed = runs.filter((run) => run.check.verdict === 'match').length;
  const close = runs.filter((run) => run.check.verdict === 'close').length;
  const failed = runs.filter((run) => run.check.verdict === 'mismatch' || run.error).length;
  return { total: runs.length, passed, close, failed };
}

/** The invocation payload for a spec test, as the preview pane would send it. */
export function testInvocation(spec: SkillSpec, test: SkillTest) {
  return {
    input: test.input,
    expected: test.expected,
    taskOutline: spec.purpose,
  };
}

/**
 * A compact transcript of a run, written for the architect to read back. The
 * agent gets the same information the author is looking at, so "the output is
 * wrong, fix the prompt" is a question it can actually answer.
 */
export function runTranscript(run: InvocationRun): string {
  const lines = [
    `Invocation source: ${runSourceLabel(run.source)}`,
    `Runtime profile: ${run.profileId}${run.degraded ? ' (ran with unmet required capabilities)' : ''}`,
    '',
    'Input:',
    run.input || '(empty)',
  ];

  const extraVariables = Object.entries(run.variables).filter(([, value]) => value.trim());
  if (extraVariables.length > 0) {
    lines.push('', 'Template variables:');
    for (const [name, value] of extraVariables) lines.push(`- ${name}: ${value}`);
  }

  if (run.expected?.trim()) {
    lines.push('', 'Expected output:', run.expected);
  }

  lines.push('', 'Actual output:', run.error ? `(failed: ${run.error})` : run.output || '(empty)');

  if (run.check.verdict !== 'unchecked') {
    lines.push('', `Automatic check: ${run.check.verdict} — ${run.check.summary}`);
  }

  return lines.join('\n');
}
