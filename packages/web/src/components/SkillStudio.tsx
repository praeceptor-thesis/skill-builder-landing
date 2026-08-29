import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveSkillDependencies, type AgentMessage, type Skill, type User } from '../services/api';
import type { CapabilityReport } from '../skill/capabilities';
import type { GraphSkillSource } from '../skill/graph';
import type { SkillSpec } from '../skill/spec';
import ArchitectPanel, { type AgentActivity } from './ArchitectPanel';
import ArchitectureGraph from './ArchitectureGraph';
import PreviewPane, { type PendingInvocation } from './PreviewPane';
import SettingsDrawer, { type DrawerSection } from './SettingsDrawer';
import SpecCanvas from './SpecCanvas';

type Props = {
  spec: SkillSpec;
  onSpecChange: (patch: Partial<SkillSpec>) => void;
  markdown: string;
  onMarkdownChange: (markdown: string) => void;
  onApplyMarkdown: () => void;
  markdownPreview: React.ReactNode;

  messages: AgentMessage[];
  activity: AgentActivity[];
  agentInput: string;
  onAgentInputChange: (value: string) => void;
  onSend: (text?: string) => void;
  isLoading: boolean;

  selectedSkill: Skill | null;
  user: User | null;
  error: string | null;
  npxCommand: string;

  onSave: () => void;
  onPublish: () => void;
  onFork: () => void;
  onBrowse: () => void;
  onHome: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onInspectSkill: (skillId: string) => void;
};

const toolbarButton =
  'rounded-full border px-3.5 py-1.5 text-xs font-medium transition';

/**
 * The skill studio.
 *
 * Three panes with one job each — the agent that writes the spec, the spec
 * itself, and a console that runs it — plus a settings drawer for the fields
 * and an architecture view for meta skills. Each pane collapses, so the author
 * can give the whole width to whichever part of the work is live.
 */
export default function SkillStudio({
  spec,
  onSpecChange,
  markdown,
  onMarkdownChange,
  onApplyMarkdown,
  markdownPreview,
  messages,
  activity,
  agentInput,
  onAgentInputChange,
  onSend,
  isLoading,
  selectedSkill,
  user,
  error,
  npxCommand,
  onSave,
  onPublish,
  onFork,
  onBrowse,
  onHome,
  onSignIn,
  onSignOut,
  onInspectSkill,
}: Props) {
  const [showArchitect, setShowArchitect] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showGraph, setShowGraph] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>('identity');
  const [pending, setPending] = useState<PendingInvocation | null>(null);
  const [capabilityReport, setCapabilityReport] = useState<CapabilityReport | null>(null);
  const [resolvedDeps, setResolvedDeps] = useState<GraphSkillSource[]>([]);
  const [resolving, setResolving] = useState(false);

  // Key on the ids themselves: normalizing the spec hands back a fresh array on
  // every keystroke, and re-walking the dependency tree for an unchanged list
  // would refetch the whole graph each time.
  const dependencyKey = (spec.dependencies ?? []).join('\n');
  const dependencies = useMemo(
    () => (dependencyKey ? dependencyKey.split('\n') : []),
    [dependencyKey],
  );
  const isMeta = spec.type === 'meta' || dependencies.length > 0;
  const rootId = selectedSkill?.id;

  // A meta skill's dependencies are ids; the graph needs the skills behind them.
  // Only fetch while the graph is on screen — this walks the whole tree.
  useEffect(() => {
    if (!showGraph || dependencies.length === 0) {
      setResolvedDeps([]);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveSkillDependencies({ id: rootId ?? '__root__', dependencies })
      .then((skills) => { if (!cancelled) setResolvedDeps(skills as unknown as GraphSkillSource[]); })
      .catch(() => { if (!cancelled) setResolvedDeps([]); })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [showGraph, dependencies, rootId]);

  // A meta skill is worth drawing; offer the graph the first time one appears.
  useEffect(() => {
    if (isMeta) setShowGraph(true);
  }, [isMeta]);

  const openDrawer = useCallback((section: DrawerSection) => {
    setDrawerSection(section);
    setDrawerOpen(true);
  }, []);

  const handlePendingHandled = useCallback(() => setPending(null), []);

  const canRun = Boolean(selectedSkill?.id);

  const runExample = useCallback((index: number) => {
    const example = spec.examples[index];
    if (!example) return;
    setShowPreview(true);
    setPending({
      source: { kind: 'example', index, title: example.title ?? '' },
      input: example.input,
      expected: example.output,
    });
  }, [spec.examples]);

  const runTest = useCallback((index: number) => {
    const test = spec.tests[index];
    if (!test) return;
    setShowPreview(true);
    setPending({
      source: { kind: 'test', index, name: test.name },
      input: test.input,
      expected: test.expected,
    });
  }, [spec.tests]);

  const columns = [
    showArchitect ? '340px' : '0px',
    'minmax(0, 1fr)',
    showPreview ? '400px' : '0px',
  ].join(' ');

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onHome}
            className="font-display text-base font-semibold text-stone-700 transition hover:text-amber-600"
          >
            &larr; skill builder
          </button>
          {selectedSkill && (
            <span className="hidden truncate text-sm text-stone-400 sm:inline">/ {selectedSkill.name}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowArchitect((v) => !v)}
            className={`${toolbarButton} ${showArchitect ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
          >
            Architect
          </button>
          <button
            onClick={() => setShowGraph((v) => !v)}
            className={`${toolbarButton} ${showGraph ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
            title={isMeta ? 'Show the dependency architecture' : 'Available once the skill orchestrates others'}
          >
            Architecture{isMeta ? ` · ${dependencies.length}` : ''}
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className={`${toolbarButton} ${showPreview ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
          >
            Preview
          </button>
          <button
            onClick={() => openDrawer('identity')}
            className={`${toolbarButton} border-stone-200 text-stone-600 hover:border-amber-500 hover:text-amber-700`}
          >
            Settings
          </button>

          <span className="mx-1 hidden h-5 w-px bg-stone-200 sm:block" />

          <button
            onClick={onBrowse}
            className="text-sm font-medium text-stone-600 transition hover:text-stone-800"
          >
            Browse
          </button>
          <button
            onClick={onSave}
            className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700"
          >
            Save
          </button>
          <button
            onClick={onPublish}
            disabled={!selectedSkill}
            className="rounded-full border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 disabled:opacity-40"
          >
            Publish
          </button>
          {selectedSkill && user && selectedSkill.authorHandle !== user.handle && (
            <button
              onClick={onFork}
              className="rounded-full border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-700 transition hover:border-stone-400"
            >
              Fork
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-2 border-l border-stone-200 pl-3">
              <span className="text-sm text-stone-500">{user.name}</span>
              <button onClick={onSignOut} className="text-xs text-stone-400 transition hover:text-stone-700">
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 xl:h-[calc(100vh-150px)]" style={{ gridTemplateColumns: columns }}>
        <div hidden={!showArchitect} className="min-h-0 xl:h-full">
          <ArchitectPanel
            messages={messages}
            activity={activity}
            input={agentInput}
            onInputChange={onAgentInputChange}
            onSend={onSend}
            isLoading={isLoading}
            spec={spec}
          />
        </div>

        <div className="min-w-0 space-y-4 xl:h-full xl:overflow-y-auto xl:pr-1">
          {showGraph && (
            <ArchitectureGraph
              spec={spec}
              resolved={resolvedDeps}
              rootId={rootId}
              loading={resolving}
              onInspectSkill={onInspectSkill}
            />
          )}

          <SpecCanvas
            spec={spec}
            capabilityReport={capabilityReport}
            onEditSection={openDrawer}
            onRunExample={runExample}
            onRunTest={runTest}
            canRun={canRun}
            markdownPreview={markdownPreview}
          />

          {selectedSkill && (
            <div className="rounded-2xl bg-stone-950 px-5 py-4 font-mono text-xs text-amber-200">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-stone-400">Install</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(npxCommand)}
                  className="font-sans font-medium text-white transition hover:text-amber-200"
                >
                  Copy
                </button>
              </div>
              <code className="break-all">{npxCommand}</code>
            </div>
          )}
        </div>

        <div hidden={!showPreview} className="min-h-0 xl:h-full">
          <PreviewPane
            spec={spec}
            skillId={selectedSkill?.id ?? null}
            pending={pending}
            onPendingHandled={handlePendingHandled}
            onReviewRun={(prompt) => onSend(prompt)}
            onRequestSave={onSave}
            onCapabilityReport={setCapabilityReport}
          />
        </div>
      </div>

      <SettingsDrawer
        open={drawerOpen}
        section={drawerSection}
        onSectionChange={setDrawerSection}
        onClose={() => setDrawerOpen(false)}
        spec={spec}
        onChange={onSpecChange}
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
        onApplyMarkdown={onApplyMarkdown}
        capabilityReport={capabilityReport}
      />
    </main>
  );
}
