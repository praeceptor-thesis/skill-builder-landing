import { useMemo, useState } from 'react';
import type { CapabilityReport } from '../skill/capabilities';
import { extractTemplateVariables } from '../skill/invocation';
import { specReadiness, type SkillSpec } from '../skill/spec';
import { CapabilityChipList, CapabilityVerdict } from './CapabilityChips';
import type { DrawerSection } from './SettingsDrawer';

type Props = {
  spec: SkillSpec;
  capabilityReport: CapabilityReport | null;
  onEditSection: (section: DrawerSection) => void;
  onRunExample: (index: number) => void;
  onRunTest: (index: number) => void;
  canRun: boolean;
  markdownPreview: React.ReactNode;
};

function EditButton({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-500 transition hover:border-amber-500 hover:text-amber-700"
    >
      {label}
    </button>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-stone-700">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Render `{{placeholders}}` as highlighted spans so the prompt's inputs read at a glance. */
function PromptPreview({ template }: { template: string }) {
  const segments = useMemo(() => {
    const parts: Array<{ text: string; variable: boolean }> = [];
    const pattern = /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/g;
    let lastIndex = 0;
    for (const match of template.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > lastIndex) parts.push({ text: template.slice(lastIndex, index), variable: false });
      parts.push({ text: match[0], variable: true });
      lastIndex = index + match[0].length;
    }
    if (lastIndex < template.length) parts.push({ text: template.slice(lastIndex), variable: false });
    return parts;
  }, [template]);

  if (!template.trim()) {
    return <p className="text-sm text-stone-400">No prompt template yet.</p>;
  }

  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-950 p-4 font-mono text-xs leading-relaxed text-stone-100">
      {segments.map((segment, index) =>
        segment.variable ? (
          <span key={index} className="rounded bg-amber-400/20 px-1 text-amber-200">{segment.text}</span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </pre>
  );
}

/**
 * The skill, read rather than filled in.
 *
 * The old editor was one long column of inputs, so the shape of the skill was
 * never visible. Here the spec is presented as a document — every block links
 * straight into the settings drawer at the field behind it.
 */
export default function SpecCanvas({
  spec,
  capabilityReport,
  onEditSection,
  onRunExample,
  onRunTest,
  canRun,
  markdownPreview,
}: Props) {
  const [showArtifact, setShowArtifact] = useState(false);
  const readiness = specReadiness(spec);
  const variables = extractTemplateVariables(spec.promptTemplate);
  const capabilities = spec.capabilities ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Current SkillSpec</p>
            <h1 className="mt-1 font-display text-3xl font-normal text-stone-900">
              {spec.name || 'Untitled skill'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
              {spec.description || 'No description yet — ask the architect, or write one in settings.'}
            </p>
          </div>
          <EditButton onClick={() => onEditSection('identity')} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-medium ${spec.type === 'meta' ? 'bg-violet-100 text-violet-700' : 'bg-stone-100 text-stone-600'}`}>
            {spec.type === 'meta' ? `meta · ${(spec.dependencies ?? []).length} deps` : 'basic'}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">{spec.category}</span>
          {spec.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-stone-100/70 px-2.5 py-1 text-stone-500">{tag}</span>
          ))}
        </div>

        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-stone-500">
              Publish readiness
              <span className="ml-1.5 text-stone-400">{readiness.done}/{readiness.total}</span>
            </p>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full transition-all ${readiness.complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${(readiness.done / readiness.total) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {readiness.requirements.map((requirement) => (
              <button
                key={requirement.id}
                type="button"
                onClick={() => onEditSection(requirement.section as DrawerSection)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  requirement.done
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 bg-white text-stone-500 hover:border-amber-500 hover:text-amber-700'
                }`}
              >
                {requirement.done ? '✓' : '○'} {requirement.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Card
        title="Capability contract"
        action={<EditButton onClick={() => onEditSection('capabilities')} label="Declare" />}
      >
        <CapabilityChipList
          capabilities={capabilities}
          report={capabilityReport}
          emptyLabel="Nothing declared — any model can invoke this skill."
          onChipClick={() => onEditSection('capabilities')}
        />
        <div className="mt-3 border-t border-stone-100 pt-3">
          <CapabilityVerdict report={capabilityReport} />
        </div>
      </Card>

      <Card
        title={`Instructions (${spec.instructions.length})`}
        action={<EditButton onClick={() => onEditSection('behavior')} />}
      >
        {spec.purpose && (
          <p className="mb-3 rounded-xl bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
            {spec.purpose}
          </p>
        )}
        {spec.instructions.length === 0 ? (
          <p className="text-sm text-stone-400">No instructions yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {spec.instructions.map((instruction, index) => (
              <li key={index} className="flex gap-2.5 text-sm text-stone-600">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-stone-400">{index + 1}</span>
                <span>{instruction}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card
        title="Prompt template"
        action={
          <div className="flex items-center gap-2">
            {variables.length > 0 && (
              <span className="text-xs text-stone-400">
                {variables.length} variable{variables.length === 1 ? '' : 's'}
              </span>
            )}
            <EditButton onClick={() => onEditSection('behavior')} />
          </div>
        }
      >
        <PromptPreview template={spec.promptTemplate} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={`Examples (${spec.examples.length})`}
          action={<EditButton onClick={() => onEditSection('examples')} />}
        >
          {spec.examples.length === 0 ? (
            <p className="text-sm text-stone-400">
              No examples yet. Ask the architect to generate edge cases.
            </p>
          ) : (
            <div className="space-y-2">
              {spec.examples.map((example, index) => (
                <div key={index} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-stone-700">
                      {example.title || `Example ${index + 1}`}
                    </p>
                    <button
                      type="button"
                      disabled={!canRun}
                      onClick={() => onRunExample(index)}
                      className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-medium text-stone-500 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                      title={canRun ? 'Run this example in the preview pane' : 'Save the skill to run it'}
                    >
                      Run
                    </button>
                  </div>
                  <pre className="mt-2 max-h-16 overflow-auto whitespace-pre-wrap text-xs text-stone-500">
                    {example.input}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={`Tests (${spec.tests.length})`}
          action={<EditButton onClick={() => onEditSection('examples')} />}
        >
          {spec.tests.length === 0 ? (
            <p className="text-sm text-stone-400">
              No tests yet. These are the expectations the preview pane scores output against.
            </p>
          ) : (
            <div className="space-y-2">
              {spec.tests.map((test, index) => (
                <div key={index} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-stone-700">
                      {test.name || `Test ${index + 1}`}
                    </p>
                    <button
                      type="button"
                      disabled={!canRun}
                      onClick={() => onRunTest(index)}
                      className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs font-medium text-stone-500 transition hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                      title={canRun ? 'Run this test in the preview pane' : 'Save the skill to run it'}
                    >
                      Run
                    </button>
                  </div>
                  <pre className="mt-2 max-h-16 overflow-auto whitespace-pre-wrap text-xs text-stone-500">
                    {test.input}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white">
        <button
          type="button"
          onClick={() => setShowArtifact((current) => !current)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-stone-700">Generated artifact</h3>
            <p className="mt-0.5 text-xs text-stone-400">
              The markdown the CLI installs. Regenerated from the spec on every change.
            </p>
          </div>
          <span className="text-xs font-medium text-stone-400">{showArtifact ? 'Hide' : 'Show'}</span>
        </button>
        {showArtifact && (
          <div className="border-t border-stone-100 px-5 py-4">
            <div className="max-h-96 overflow-y-auto rounded-xl border border-stone-100 bg-white px-5 py-4">
              {markdownPreview}
            </div>
            <div className="mt-3 flex justify-end">
              <EditButton onClick={() => onEditSection('artifact')} label="Edit source" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
