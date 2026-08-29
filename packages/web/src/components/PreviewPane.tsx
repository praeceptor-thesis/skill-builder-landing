import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { executeSkill, getRuntimeProfile, type ExecuteSkillRequest } from '../services/api';
import {
  DEFAULT_RUNTIME_PROFILE_ID,
  RUNTIME_PROFILES,
  checkCapabilities,
  runtimeProfile,
  type CapabilityReport,
  type RuntimeProfile,
} from '../skill/capabilities';
import {
  checkOutput,
  extractTemplateVariables,
  renderTemplate,
  runTranscript,
  runSourceLabel,
  summarizeRuns,
  unfilledVariables,
  type InvocationRun,
  type RunSource,
} from '../skill/invocation';
import type { SkillSpec } from '../skill/spec';
import { CapabilityVerdict } from './CapabilityChips';

export type PendingInvocation = {
  source: RunSource;
  input: string;
  expected?: string;
};

type Props = {
  spec: SkillSpec;
  /** Execution needs a saved skill: the worker loads it by id from the registry. */
  skillId: string | null;
  /** A run requested from elsewhere in the studio (an example card, the agent). */
  pending: PendingInvocation | null;
  onPendingHandled: () => void;
  onReviewRun: (prompt: string) => void;
  onRequestSave: () => void;
  onCapabilityReport: (report: CapabilityReport | null) => void;
};

const verdictTone: Record<string, string> = {
  match: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  close: 'bg-amber-50 text-amber-700 border-amber-200',
  mismatch: 'bg-red-50 text-red-700 border-red-200',
  unchecked: 'bg-stone-50 text-stone-500 border-stone-200',
};

/**
 * Run the skill and look at what comes back.
 *
 * The spec sent is the working draft, not the saved copy, so an author sees the
 * effect of an edit before committing it. Every run is scored against whatever
 * expectation it had (an example's output, a test's expectation), and any run
 * can be handed to the architect for a written review — which is how the agent
 * gets to double-check its own work.
 */
export default function PreviewPane({
  spec,
  skillId,
  pending,
  onPendingHandled,
  onReviewRun,
  onRequestSave,
  onCapabilityReport,
}: Props) {
  const [profileId, setProfileId] = useState(DEFAULT_RUNTIME_PROFILE_ID);
  const [sandboxProfile, setSandboxProfile] = useState<RuntimeProfile | null>(null);
  const [input, setInput] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<InvocationRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const runCounter = useRef(0);

  // Ask the worker what its execution runtime can actually do, so the preflight
  // reflects the real sandbox rather than a guess baked into the bundle.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const profile = await getRuntimeProfile?.(controller.signal);
        if (!cancelled && profile?.capabilities) {
          setSandboxProfile({
            id: profile.id,
            label: profile.label,
            description: profile.model ? `${profile.description} (${profile.model})` : profile.description,
            capabilities: profile.capabilities,
          });
        }
      } catch {
        // Fall back to the bundled catalog; the preflight is advisory anyway.
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const profiles = useMemo(() => {
    if (!sandboxProfile) return RUNTIME_PROFILES;
    return RUNTIME_PROFILES.map((profile) => (profile.id === sandboxProfile.id ? sandboxProfile : profile));
  }, [sandboxProfile]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) ?? runtimeProfile(profileId),
    [profiles, profileId],
  );

  const report = useMemo(
    () => checkCapabilities(spec.capabilities ?? [], activeProfile),
    [spec.capabilities, activeProfile],
  );

  useEffect(() => { onCapabilityReport(report); }, [report, onCapabilityReport]);

  const templateVariables = useMemo(
    () => extractTemplateVariables(spec.promptTemplate).filter((variable) => !variable.primary),
    [spec.promptTemplate],
  );

  const missingVariables = useMemo(
    () => unfilledVariables(spec.promptTemplate, { ...variables, input }),
    [spec.promptTemplate, variables, input],
  );

  const activeRun = runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null;

  const invoke = useCallback(async (
    source: RunSource,
    runInput: string,
    expected: string | undefined,
    options: { force?: boolean } = {},
  ): Promise<InvocationRun | null> => {
    if (!skillId) {
      setError('Save the skill before running it — execution resolves the skill by its registry id.');
      return null;
    }

    const startedAt = new Date();
    const started = performance.now();
    runCounter.current += 1;
    const id = `run-${runCounter.current}-${startedAt.getTime()}`;

    const request: ExecuteSkillRequest = {
      input: runInput,
      taskOutline: spec.purpose || undefined,
      // Send the working draft so unsaved edits are what gets exercised.
      spec: { ...spec, promptTemplate: renderTemplate(spec.promptTemplate, variables) },
      ...((options.force ?? !report.satisfied) ? { force: true } : {}),
    };

    try {
      const response = await executeSkill(skillId, request);
      const output = response.response ?? '';
      const run: InvocationRun = {
        id,
        source,
        input: runInput,
        variables,
        expected,
        output,
        check: checkOutput(output, expected ?? ''),
        startedAt: startedAt.toISOString(),
        durationMs: Math.round(performance.now() - started),
        profileId: activeProfile.id,
        degraded: Boolean(response.degraded) || !report.satisfied,
      };
      setRuns((previous) => [run, ...previous].slice(0, 25));
      setActiveRunId(id);
      setError(null);
      return run;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Execution failed';
      const run: InvocationRun = {
        id,
        source,
        input: runInput,
        variables,
        expected,
        output: '',
        error: message,
        check: { verdict: 'mismatch', similarity: 0, summary: message },
        startedAt: startedAt.toISOString(),
        durationMs: Math.round(performance.now() - started),
        profileId: activeProfile.id,
        degraded: !report.satisfied,
      };
      setRuns((previous) => [run, ...previous].slice(0, 25));
      setActiveRunId(id);
      setError(message);
      return run;
    }
  }, [skillId, spec, variables, activeProfile.id, report.satisfied]);

  const runOnce = useCallback(async (
    source: RunSource,
    runInput: string,
    expected?: string,
    options: { force?: boolean } = {},
  ) => {
    setRunning(true);
    setRunningLabel(runSourceLabel(source));
    try {
      await invoke(source, runInput, expected, options);
    } finally {
      setRunning(false);
      setRunningLabel('');
    }
  }, [invoke]);

  // A run requested from the spec canvas or the agent lands here. Both the
  // runner and the in-flight flag are read through refs so this fires on a new
  // request and nothing else — depending on `runOnce` directly would replay the
  // same invocation every time its identity churned.
  const runOnceRef = useRef(runOnce);
  const runningRef = useRef(running);
  useEffect(() => { runOnceRef.current = runOnce; }, [runOnce]);
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    if (!pending || runningRef.current) return;
    setInput(pending.input);
    void runOnceRef.current(pending.source, pending.input, pending.expected);
    onPendingHandled();
  }, [pending, onPendingHandled]);

  const runTests = useCallback(async () => {
    if (spec.tests.length === 0) return;
    setRunning(true);
    const completed: InvocationRun[] = [];
    try {
      for (let index = 0; index < spec.tests.length; index += 1) {
        const test = spec.tests[index];
        setRunningLabel(`${test.name || `Test ${index + 1}`} (${index + 1}/${spec.tests.length})`);
        const run = await invoke({ kind: 'test', index, name: test.name }, test.input, test.expected);
        if (run) completed.push(run);
      }
    } finally {
      setRunning(false);
      setRunningLabel('');
    }
    return completed;
  }, [spec.tests, invoke]);

  const testRuns = runs.filter((run) => run.source.kind === 'test');
  const testSummary = summarizeRuns(testRuns.slice(0, spec.tests.length));

  const blockedByCapabilities = !report.satisfied;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">Preview</p>
            <h3 className="mt-0.5 font-display text-xl font-normal text-stone-900">Invocation</h3>
          </div>
          {runs.length > 0 && (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
              {runs.length} run{runs.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">Runtime</span>
          <select
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>
        <p className="mt-1.5 text-xs text-stone-400">{activeProfile.description}</p>

        <div className="mt-2.5 border-t border-stone-100 pt-2.5">
          <CapabilityVerdict report={report} />
          {profileId !== DEFAULT_RUNTIME_PROFILE_ID && (
            <p className="mt-1.5 text-xs text-stone-400">
              Runs always execute on the preview sandbox. This profile is a preflight against the runtime
              you intend to ship to.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">Input</span>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder="What would a caller send to this skill?"
            className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
          />
        </label>

        {templateVariables.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-stone-500">
              Template variables
              <span className="ml-1 font-normal text-stone-400">from the prompt</span>
            </p>
            {templateVariables.map((variable) => (
              <label key={variable.name} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-stone-500" title={variable.name}>
                  {variable.name}
                </span>
                <input
                  value={variables[variable.name] ?? ''}
                  onChange={(event) => setVariables((current) => ({ ...current, [variable.name]: event.target.value }))}
                  placeholder={`{{${variable.name}}}`}
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>
            ))}
            {missingVariables.length > 0 && (
              <p className="text-xs text-amber-700">
                {missingVariables.join(', ')} left unfilled — the placeholder is sent through as written.
              </p>
            )}
          </div>
        )}

        {!skillId && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Execution resolves the skill by its registry id, so this draft has to be saved first.
            <button
              type="button"
              onClick={onRequestSave}
              className="ml-1 font-semibold underline underline-offset-2 hover:text-amber-900"
            >
              Save it now
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running || !input.trim() || !skillId}
            onClick={() => runOnce({ kind: 'manual' }, input, undefined)}
            className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-40"
          >
            {running ? `Running ${runningLabel}…` : blockedByCapabilities ? 'Run anyway (degraded)' : 'Run skill'}
          </button>
          <button
            type="button"
            disabled={running || spec.tests.length === 0 || !skillId}
            onClick={() => void runTests()}
            className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-600 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
            title="Run every test in the spec and score the output"
          >
            Run tests ({spec.tests.length})
          </button>
        </div>

        {spec.examples.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-stone-500">Run from an example</p>
            <div className="flex flex-wrap gap-1.5">
              {spec.examples.map((example, index) => (
                <button
                  key={`${example.title}-${index}`}
                  type="button"
                  disabled={running || !skillId}
                  onClick={() => {
                    setInput(example.input);
                    void runOnce(
                      { kind: 'example', index, title: example.title ?? '' },
                      example.input,
                      example.output,
                    );
                  }}
                  className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                >
                  {example.title || `Example ${index + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {testRuns.length > 0 && (
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <span className="font-semibold text-emerald-700">{testSummary.passed} matched</span>
            {testSummary.close > 0 && <span className="text-amber-700"> · {testSummary.close} close</span>}
            {testSummary.failed > 0 && <span className="text-red-700"> · {testSummary.failed} off</span>}
            <span className="text-stone-400"> of {testSummary.total} test runs</span>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-400">Output</p>
          {activeRun && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">{activeRun.durationMs} ms</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(activeRun.output)}
                className="text-xs font-medium text-stone-500 hover:text-amber-700"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!activeRun ? (
            <p className="py-8 text-center text-xs text-stone-400">
              No runs yet. Send an input, replay an example, or run the test suite to see what this skill
              actually produces.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                  {runSourceLabel(activeRun.source)}
                </span>
                {activeRun.check.verdict !== 'unchecked' && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictTone[activeRun.check.verdict]}`}>
                    {activeRun.check.verdict}
                  </span>
                )}
                {activeRun.degraded && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    degraded
                  </span>
                )}
              </div>

              {activeRun.check.verdict !== 'unchecked' && (
                <p className="text-xs text-stone-500">{activeRun.check.summary}</p>
              )}

              {activeRun.error ? (
                <pre className="whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-xs text-red-700">{activeRun.error}</pre>
              ) : (
                <pre className="whitespace-pre-wrap rounded-xl bg-stone-950 p-3 font-mono text-xs leading-relaxed text-stone-100">
                  {activeRun.output || '(empty response)'}
                </pre>
              )}

              {activeRun.expected && (
                <details className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-stone-600">Expected output</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-stone-500">{activeRun.expected}</pre>
                </details>
              )}

              <button
                type="button"
                onClick={() => onReviewRun(
                  `Review this invocation of the skill and fix the spec if the output is wrong.\n\n${runTranscript(activeRun)}`,
                )}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
              >
                Ask the architect to review this run
              </button>
            </div>
          )}
        </div>

        {runs.length > 1 && (
          <div className="max-h-32 shrink-0 overflow-y-auto border-t border-stone-100 px-2 py-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setActiveRunId(run.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                  run.id === activeRun?.id ? 'bg-stone-100' : 'hover:bg-stone-50'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    run.error || run.check.verdict === 'mismatch'
                      ? 'bg-red-500'
                      : run.check.verdict === 'close'
                        ? 'bg-amber-500'
                        : run.check.verdict === 'match'
                          ? 'bg-emerald-500'
                          : 'bg-stone-300'
                  }`}
                />
                <span className="flex-1 truncate text-stone-600">{runSourceLabel(run.source)}</span>
                <span className="shrink-0 text-stone-400">{run.durationMs} ms</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
