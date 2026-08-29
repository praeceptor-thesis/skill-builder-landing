import {
  capabilityDefinition,
  capabilityLabel,
  type CapabilityReport,
  type SkillCapability,
} from '../skill/capabilities';

const levelStyles: Record<string, string> = {
  required: 'border-amber-300 bg-amber-50 text-amber-800',
  preferred: 'border-stone-200 bg-stone-50 text-stone-600',
};

export function CapabilityChip({
  capability,
  supported,
  onClick,
}: {
  capability: SkillCapability;
  /** Undefined when no runtime has been checked yet. */
  supported?: boolean;
  onClick?: () => void;
}) {
  const definition = capabilityDefinition(capability.id);
  const title = [
    definition?.summary ?? 'Custom capability declared by this skill.',
    capability.note ? `Note: ${capability.note}` : '',
    supported === false ? 'Not available on the selected runtime.' : '',
  ].filter(Boolean).join('\n');

  const unmet = supported === false;
  const tone = unmet
    ? capability.level === 'required'
      ? 'border-red-300 bg-red-50 text-red-700'
      : 'border-stone-300 bg-white text-stone-500 line-through decoration-stone-300'
    : levelStyles[capability.level];

  const Element = onClick ? 'button' : 'span';

  return (
    <Element
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${tone} ${onClick ? 'hover:border-amber-500' : ''}`}
    >
      {unmet && <span aria-hidden="true">⚠</span>}
      <span>{capabilityLabel(capability.id)}</span>
      {capability.level === 'preferred' && <span className="text-[10px] font-normal opacity-70">preferred</span>}
    </Element>
  );
}

export function CapabilityChipList({
  capabilities,
  report,
  emptyLabel = 'No capability requirements declared.',
  onChipClick,
}: {
  capabilities: SkillCapability[];
  report?: CapabilityReport | null;
  emptyLabel?: string;
  onChipClick?: () => void;
}) {
  if (capabilities.length === 0) {
    return <p className="text-xs text-stone-400">{emptyLabel}</p>;
  }

  const supportById = new Map(report?.entries.map((entry) => [entry.id, entry.supported]) ?? []);

  return (
    <div className="flex flex-wrap gap-1.5">
      {capabilities.map((capability) => (
        <CapabilityChip
          key={capability.id}
          capability={capability}
          supported={supportById.get(capability.id)}
          onClick={onChipClick}
        />
      ))}
    </div>
  );
}

/**
 * The verdict line for a capability check: whether the selected runtime can
 * honestly run this skill, and what is missing when it cannot.
 */
export function CapabilityVerdict({ report }: { report: CapabilityReport | null }) {
  if (!report) return null;

  if (report.entries.length === 0) {
    return (
      <p className="text-xs text-stone-400">
        No capability contract — this skill runs anywhere.
      </p>
    );
  }

  if (report.satisfied && report.missingPreferred.length === 0) {
    return (
      <p className="text-xs font-medium text-emerald-700">
        ✓ {report.profileLabel} satisfies every declared capability.
      </p>
    );
  }

  if (report.satisfied) {
    return (
      <p className="text-xs text-stone-500">
        {report.profileLabel} covers the required capabilities. Missing preferred:{' '}
        <span className="font-medium text-stone-600">
          {report.missingPreferred.map((c) => capabilityLabel(c.id)).join(', ')}
        </span>
        . Output may be weaker than intended.
      </p>
    );
  }

  return (
    <p className="text-xs font-medium text-red-700">
      ⚠ {report.profileLabel} cannot provide{' '}
      {report.missingRequired.map((c) => capabilityLabel(c.id)).join(', ')}. Runs here are not
      representative of how this skill behaves in production.
    </p>
  );
}
