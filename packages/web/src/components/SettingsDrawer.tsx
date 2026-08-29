import { useEffect, useRef } from 'react';
import {
  CAPABILITY_CATALOG,
  CAPABILITY_GROUP_LABELS,
  capabilityDefinition,
  normalizeCapabilities,
  toCapabilityId,
  type CapabilityGroup,
  type CapabilityReport,
  type SkillCapability,
} from '../skill/capabilities';
import {
  CATEGORY_OPTIONS,
  normalizeStringArray,
  parseDependencies,
  resolveSkillType,
  type SkillExample,
  type SkillSpec,
  type SkillTest,
  type SkillType,
} from '../skill/spec';
import { CapabilityVerdict } from './CapabilityChips';

export type DrawerSection = 'identity' | 'behavior' | 'capabilities' | 'architecture' | 'examples' | 'artifact';

const SECTIONS: Array<{ id: DrawerSection; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'architecture', label: 'Composition' },
  { id: 'examples', label: 'Examples & tests' },
  { id: 'artifact', label: 'Artifact' },
];

const fieldClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white';
const monoFieldClass =
  'w-full resize-y rounded-xl border border-stone-200 bg-stone-950 px-4 py-3 font-mono text-xs text-stone-100 outline-none transition focus:border-amber-500';

type Props = {
  open: boolean;
  section: DrawerSection;
  onSectionChange: (section: DrawerSection) => void;
  onClose: () => void;
  spec: SkillSpec;
  onChange: (patch: Partial<SkillSpec>) => void;
  markdown: string;
  onMarkdownChange: (markdown: string) => void;
  onApplyMarkdown: () => void;
  capabilityReport: CapabilityReport | null;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-lg font-normal text-stone-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-stone-400">{description}</p>
    </div>
  );
}

/**
 * Every field of the SkillSpec, out of the way until it is wanted.
 *
 * The studio's centre pane is for reading the skill and the agent writes most
 * of it; this drawer is where a human goes to correct a specific field without
 * losing the thread of the conversation.
 */
export default function SettingsDrawer({
  open,
  section,
  onSectionChange,
  onClose,
  spec,
  onChange,
  markdown,
  onMarkdownChange,
  onApplyMarkdown,
  capabilityReport,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const node = panelRef.current;
    if (open && typeof node?.scrollTo === 'function') node.scrollTo({ top: 0 });
  }, [open, section]);

  if (!open) return null;

  const capabilities = spec.capabilities ?? [];
  const dependencies = spec.dependencies ?? [];

  const setCapability = (id: string, level: SkillCapability['level'] | null) => {
    const without = capabilities.filter((capability) => capability.id !== id);
    onChange({
      capabilities: level === null
        ? without
        : normalizeCapabilities([...without, { id, level, note: capabilities.find((c) => c.id === id)?.note }]),
    });
  };

  const setCapabilityNote = (id: string, note: string) => {
    onChange({
      capabilities: capabilities.map((capability) =>
        capability.id === id ? { ...capability, note: note.trim() ? note : undefined } : capability,
      ),
    });
  };

  const updateExample = (index: number, patch: Partial<SkillExample>) => {
    onChange({ examples: spec.examples.map((example, i) => (i === index ? { ...example, ...patch } : example)) });
  };

  const updateTest = (index: number, patch: Partial<SkillTest>) => {
    onChange({ tests: spec.tests.map((test, i) => (i === index ? { ...test, ...patch } : test)) });
  };

  const groups = Object.keys(CAPABILITY_GROUP_LABELS) as CapabilityGroup[];
  const customCapabilities = capabilities.filter((capability) => !capabilityDefinition(capability.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 bg-stone-900/40 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-label="Skill settings"
        className="flex h-full w-full max-w-xl flex-col border-l border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-600">Settings</p>
            <h2 className="mt-1 font-display text-2xl font-normal text-stone-900">
              {spec.name || 'Untitled skill'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-200"
          >
            Done
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 py-2">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSectionChange(entry.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                section === entry.id ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div ref={panelRef} className="flex-1 overflow-y-auto px-6 py-5">
          {section === 'identity' && (
            <div className="space-y-4">
              <SectionHeading
                title="Identity"
                description="How the skill is listed, searched, and installed from the registry."
              />
              <Field label="Name">
                <input
                  value={spec.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="Clinical Note Summarizer"
                  className={fieldClass}
                />
              </Field>
              <Field label="Description" hint="One sentence. This is the registry listing.">
                <textarea
                  value={spec.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  rows={3}
                  className={fieldClass}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <select
                    value={spec.category}
                    onChange={(e) => onChange({ category: e.target.value })}
                    className={fieldClass}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Tags" hint="Comma separated.">
                  <input
                    value={spec.tags.join(', ')}
                    onChange={(e) => onChange({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                    placeholder="summarization, clinical"
                    className={fieldClass}
                  />
                </Field>
              </div>
            </div>
          )}

          {section === 'behavior' && (
            <div className="space-y-4">
              <SectionHeading
                title="Behavior"
                description="What the skill owns and the prompt it runs. Placeholders written as {{name}} become fields in the preview pane."
              />
              <Field label="Purpose">
                <textarea
                  value={spec.purpose}
                  onChange={(e) => onChange({ purpose: e.target.value })}
                  rows={4}
                  placeholder="What job should this skill own?"
                  className={fieldClass}
                />
              </Field>
              <Field label="Instructions" hint="One per line. Order matters — they run as steps.">
                <textarea
                  value={spec.instructions.join('\n')}
                  onChange={(e) => onChange({ instructions: normalizeStringArray(e.target.value) })}
                  rows={7}
                  placeholder={'Identify the user intent\nExtract the required fields\nReturn structured JSON'}
                  className={fieldClass}
                />
              </Field>
              <Field label="Prompt template">
                <textarea
                  value={spec.promptTemplate}
                  onChange={(e) => onChange({ promptTemplate: e.target.value })}
                  rows={10}
                  spellCheck={false}
                  placeholder={'You are a reusable AI skill.\n\nInput: {{input}}\nOutput format: {{format}}'}
                  className={monoFieldClass}
                />
              </Field>
            </div>
          )}

          {section === 'capabilities' && (
            <div className="space-y-5">
              <SectionHeading
                title="Required capabilities"
                description="What a model must be able to do to invoke this skill. Required capabilities gate execution; preferred ones only degrade it. The contract travels with the skill through the registry, the CLI, and MCP, so an agent can tell whether it can run this before it tries."
              />

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <CapabilityVerdict report={capabilityReport} />
              </div>

              {groups.map((group) => (
                <div key={group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                    {CAPABILITY_GROUP_LABELS[group]}
                  </p>
                  <div className="space-y-1.5">
                    {CAPABILITY_CATALOG.filter((entry) => entry.group === group).map((entry) => {
                      const declared = capabilities.find((capability) => capability.id === entry.id);
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-xl border px-3 py-2.5 transition ${
                            declared ? 'border-amber-200 bg-amber-50/60' : 'border-stone-200 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-stone-800">{entry.label}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-stone-400">{entry.summary}</p>
                            </div>
                            <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-stone-200 text-[11px]">
                              {([
                                ['none', 'Off'],
                                ['preferred', 'Preferred'],
                                ['required', 'Required'],
                              ] as const).map(([value, label]) => {
                                const active = value === 'none' ? !declared : declared?.level === value;
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => setCapability(entry.id, value === 'none' ? null : value)}
                                    className={`px-2 py-1 font-medium transition ${
                                      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {declared && (
                            <input
                              value={declared.note ?? ''}
                              onChange={(e) => setCapabilityNote(entry.id, e.target.value)}
                              placeholder="Why this skill needs it (optional)"
                              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs outline-none transition focus:border-amber-500"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Custom</p>
                {customCapabilities.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {customCapabilities.map((capability) => (
                      <div
                        key={capability.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2"
                      >
                        <span className="font-mono text-xs text-violet-800">{capability.id}</span>
                        <button
                          type="button"
                          onClick={() => setCapability(capability.id, null)}
                          className="text-xs font-medium text-stone-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const input = form.elements.namedItem('capability') as HTMLInputElement;
                    const id = toCapabilityId(input.value);
                    if (id) {
                      onChange({ capabilities: normalizeCapabilities([...capabilities, { id, level: 'required' }]) });
                      input.value = '';
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="capability"
                    placeholder="Capability we haven't modeled, e.g. ocr"
                    className={`${fieldClass} flex-1`}
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl border border-stone-200 px-4 text-sm font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>
          )}

          {section === 'architecture' && (
            <div className="space-y-4">
              <SectionHeading
                title="Composition"
                description="A meta skill orchestrates others and installs them alongside itself. Declaring a dependency makes this skill meta."
              />
              <div className="space-y-1.5 text-sm">
                <span className="font-medium text-stone-700">Skill type</span>
                <div className="inline-flex overflow-hidden rounded-xl border border-stone-200 text-sm">
                  {(['basic', 'meta'] as SkillType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onChange({ type: resolveSkillType(type, dependencies) })}
                      className={`px-4 py-2 font-medium transition ${
                        spec.type === type ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {type === 'basic' ? 'Basic' : 'Meta'}
                    </button>
                  ))}
                </div>
                {dependencies.length > 0 && (
                  <p className="text-xs text-violet-600">
                    Dependencies are declared, so this skill is meta regardless of the toggle.
                  </p>
                )}
              </div>
              <Field
                label="Dependencies"
                hint="Registry ids, comma or newline separated. Bare ids are scoped to your handle on save."
              >
                <textarea
                  value={dependencies.join('\n')}
                  onChange={(e) => {
                    const next = parseDependencies(e.target.value);
                    onChange({ dependencies: next, type: resolveSkillType(spec.type, next) });
                  }}
                  rows={6}
                  spellCheck={false}
                  placeholder={'@skillauthor/dialogue-flow\n@skillauthor/extract-entities'}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </Field>
            </div>
          )}

          {section === 'examples' && (
            <div className="space-y-6">
              <SectionHeading
                title="Examples & tests"
                description="Examples show the skill's shape; tests are the expectations the preview pane checks output against."
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-stone-700">Examples ({spec.examples.length})</p>
                  <button
                    type="button"
                    onClick={() => onChange({ examples: [...spec.examples, { title: `Example ${spec.examples.length + 1}`, input: '', output: '' }] })}
                    className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
                  >
                    Add example
                  </button>
                </div>
                <div className="space-y-3">
                  {spec.examples.length === 0 && (
                    <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-xs text-stone-400">
                      No examples yet. Ask the architect for edge cases, or add one by hand.
                    </p>
                  )}
                  {spec.examples.map((example, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex gap-2">
                        <input
                          value={example.title ?? ''}
                          onChange={(e) => updateExample(index, { title: e.target.value })}
                          placeholder={`Example ${index + 1}`}
                          className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium outline-none transition focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => onChange({ examples: spec.examples.filter((_, i) => i !== index) })}
                          className="shrink-0 rounded-lg px-2 text-xs font-medium text-stone-400 transition hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={example.input}
                        onChange={(e) => updateExample(index, { input: e.target.value })}
                        rows={2}
                        placeholder="Input"
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-amber-500"
                      />
                      <textarea
                        value={example.output}
                        onChange={(e) => updateExample(index, { output: e.target.value })}
                        rows={3}
                        placeholder="Expected output"
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-stone-700">Tests ({spec.tests.length})</p>
                  <button
                    type="button"
                    onClick={() => onChange({ tests: [...spec.tests, { name: `Test ${spec.tests.length + 1}`, input: '', expected: '' }] })}
                    className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
                  >
                    Add test
                  </button>
                </div>
                <div className="space-y-3">
                  {spec.tests.length === 0 && (
                    <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-xs text-stone-400">
                      No tests yet. The preview pane runs these and scores the output against each expectation.
                    </p>
                  )}
                  {spec.tests.map((test, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex gap-2">
                        <input
                          value={test.name}
                          onChange={(e) => updateTest(index, { name: e.target.value })}
                          placeholder={`Test ${index + 1}`}
                          className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium outline-none transition focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => onChange({ tests: spec.tests.filter((_, i) => i !== index) })}
                          className="shrink-0 rounded-lg px-2 text-xs font-medium text-stone-400 transition hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={test.input}
                        onChange={(e) => updateTest(index, { input: e.target.value })}
                        rows={2}
                        placeholder="Input"
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-amber-500"
                      />
                      <textarea
                        value={test.expected}
                        onChange={(e) => updateTest(index, { expected: e.target.value })}
                        rows={3}
                        placeholder="Expected output"
                        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'artifact' && (
            <div className="space-y-4">
              <SectionHeading
                title="Markdown artifact"
                description="Generated from the spec and regenerated on every change. Edit it directly to import a skill written elsewhere, then parse it back into the spec."
              />
              <textarea
                value={markdown}
                onChange={(e) => onMarkdownChange(e.target.value)}
                rows={22}
                spellCheck={false}
                className={monoFieldClass}
              />
              <button
                type="button"
                onClick={onApplyMarkdown}
                className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
              >
                Parse markdown into the spec
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
