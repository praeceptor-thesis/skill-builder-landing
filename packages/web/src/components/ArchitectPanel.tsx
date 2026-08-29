import { useEffect, useMemo, useRef } from 'react';
import type { AgentMessage } from '../services/api';
import { specRequirements, type SkillSpec } from '../skill/spec';

export type AgentActivity = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
};

type Props = {
  messages: AgentMessage[];
  activity: AgentActivity[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: (text?: string) => void;
  isLoading: boolean;
  spec: SkillSpec;
};

const statusDot: Record<AgentActivity['status'], string> = {
  done: 'bg-emerald-500',
  running: 'bg-amber-500 animate-pulse',
  error: 'bg-red-500',
  pending: 'bg-stone-300',
};

/**
 * The next thing worth asking the agent for, derived from what the spec is
 * still missing. This is the difference between a chat box and a guide: the
 * author never has to work out what the builder wants next.
 */
function nextSteps(spec: SkillSpec): Array<{ label: string; intent: string }> {
  const missing = new Set(specRequirements(spec).filter((r) => !r.done).map((r) => r.id));
  const steps: Array<{ label: string; intent: string }> = [];

  if (missing.has('name') || missing.has('description')) {
    steps.push({
      label: 'Name and describe it',
      intent: 'Give this skill a precise name and a one-sentence registry description.',
    });
  }
  if (missing.has('purpose') || missing.has('instructions')) {
    steps.push({
      label: 'Define the behavior',
      intent: 'Write the purpose and the ordered instructions this skill should follow.',
    });
  }
  if (missing.has('promptTemplate')) {
    steps.push({
      label: 'Author the prompt',
      intent: 'Write a production-ready prompt template with {{input}} and any other placeholders it needs.',
    });
  }
  if ((spec.capabilities ?? []).length === 0) {
    steps.push({
      label: 'Declare capabilities',
      intent: 'Declare the model capabilities required to invoke this skill, with a reason for each.',
    });
  }
  if (missing.has('examples')) {
    steps.push({
      label: 'Generate examples',
      intent: 'Generate three examples covering the happy path and two edge cases.',
    });
  }
  if (missing.has('tests')) {
    steps.push({
      label: 'Write tests',
      intent: 'Write validation tests with concrete inputs and the exact expected output.',
    });
  }
  if (missing.has('dependencies')) {
    steps.push({
      label: 'Pick dependencies',
      intent: 'Suggest which registry skills this meta skill should orchestrate, and why.',
    });
  }

  if (steps.length === 0) {
    steps.push(
      { label: 'Tighten the prompt', intent: 'Review the prompt template and tighten anything ambiguous.' },
      { label: 'Harden edge cases', intent: 'Find the edge cases this skill would currently handle badly, and cover them.' },
    );
  }

  return steps.slice(0, 4);
}

export default function ArchitectPanel({
  messages,
  activity,
  input,
  onInputChange,
  onSend,
  isLoading,
  spec,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => nextSteps(spec), [spec]);
  const recentActivity = activity.slice(-5);

  useEffect(() => {
    const node = scrollRef.current;
    // `scrollTo` is absent in jsdom and older embedded browsers; the panel just
    // stays where it is there rather than throwing out of the effect.
    if (typeof node?.scrollTo === 'function') {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, isLoading]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-600">Agent-first builder</p>
        <h2 className="mt-1 font-display text-xl font-normal text-stone-900">Skill Architect</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-400">
          Describe the capability you want. The agent edits the spec directly — you correct it in settings.
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              message.role === 'user'
                ? 'ml-6 bg-stone-900 text-stone-50'
                : 'mr-2 bg-stone-50 text-stone-700'
            }`}
          >
            <p className="whitespace-pre-line">{message.text}</p>
          </div>
        ))}
        {isLoading && (
          <div className="mr-2 flex items-center gap-2 rounded-2xl bg-stone-50 px-4 py-2.5 text-sm text-stone-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Editing the spec…
          </div>
        )}
      </div>

      {recentActivity.length > 0 && (
        <div className="shrink-0 border-t border-stone-100 bg-amber-50/50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">Build pipeline</p>
          <div className="space-y-1.5">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-xs">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[item.status]}`} />
                <div className="min-w-0">
                  <p className="font-medium text-stone-700">{item.label}</p>
                  {item.detail && <p className="truncate text-stone-400">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-stone-100 px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {steps.map((step) => (
            <button
              key={step.label}
              type="button"
              disabled={isLoading}
              onClick={() => onSend(step.intent)}
              title={step.intent}
              className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-40"
            >
              {step.label}
            </button>
          ))}
        </div>

        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={3}
          disabled={isLoading}
          placeholder="Build a skill that extracts lab values from clinical notes and returns JSON."
          className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => onSend()}
          disabled={isLoading || !input.trim()}
          className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          {isLoading ? 'Working…' : 'Send to architect'}
        </button>
      </div>
    </div>
  );
}
