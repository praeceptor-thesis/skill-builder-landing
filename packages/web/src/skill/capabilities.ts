/**
 * Model capability contracts.
 *
 * A skill declares the capabilities a model must have to invoke it. The
 * declaration is part of the SkillSpec, so it travels with the skill through
 * the registry, the CLI, and MCP — an agent can check whether it is able to
 * run a skill *before* it burns a turn on it.
 *
 * `required` capabilities gate execution; `preferred` ones only degrade it.
 */

export type CapabilityLevel = 'required' | 'preferred';

export type SkillCapability = {
  /** Catalog id, or a custom slug for a capability we do not model yet. */
  id: string;
  level: CapabilityLevel;
  /** Why this skill needs it — shown to whoever is deciding to invoke. */
  note?: string;
};

export type CapabilityGroup = 'io' | 'reasoning' | 'tools' | 'session';

export type CapabilityDefinition = {
  id: string;
  label: string;
  summary: string;
  group: CapabilityGroup;
};

export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroup, string> = {
  io: 'Input & output',
  reasoning: 'Reasoning',
  tools: 'Tools & environment',
  session: 'Session',
};

/**
 * The catalog is intentionally about *model* abilities, not vendors: a skill
 * that needs to read screenshots requires `vision` regardless of who serves it.
 */
export const CAPABILITY_CATALOG: CapabilityDefinition[] = [
  { id: 'vision', label: 'Vision', summary: 'Accept images and reason over their contents.', group: 'io' },
  { id: 'audio-input', label: 'Audio input', summary: 'Accept spoken or recorded audio as input.', group: 'io' },
  { id: 'file-input', label: 'File input', summary: 'Accept file attachments such as PDF, CSV, or DOCX.', group: 'io' },
  { id: 'structured-output', label: 'Structured output', summary: 'Emit schema-constrained JSON reliably.', group: 'io' },
  { id: 'streaming', label: 'Streaming', summary: 'Stream tokens incrementally to the caller.', group: 'io' },

  { id: 'extended-reasoning', label: 'Extended reasoning', summary: 'Deliberate over multiple steps before answering.', group: 'reasoning' },
  { id: 'long-context', label: 'Long context', summary: 'Hold roughly 100k tokens or more in context.', group: 'reasoning' },
  { id: 'multilingual', label: 'Multilingual', summary: 'Work in languages other than English.', group: 'reasoning' },

  { id: 'tool-use', label: 'Tool use', summary: 'Call functions or tools and use their results.', group: 'tools' },
  { id: 'parallel-tool-calls', label: 'Parallel tool calls', summary: 'Issue several tool calls in a single turn.', group: 'tools' },
  { id: 'code-execution', label: 'Code execution', summary: 'Run code in a sandbox and read the output.', group: 'tools' },
  { id: 'web-search', label: 'Web search', summary: 'Retrieve live information from the web.', group: 'tools' },
  { id: 'file-system', label: 'File system', summary: 'Read and write files in a workspace.', group: 'tools' },
  { id: 'computer-use', label: 'Computer use', summary: 'Drive a graphical interface directly.', group: 'tools' },
  { id: 'mcp-client', label: 'MCP client', summary: 'Connect to MCP servers and use their tools.', group: 'tools' },

  { id: 'persistent-memory', label: 'Persistent memory', summary: 'Carry state across separate sessions.', group: 'session' },
  { id: 'citations', label: 'Citations', summary: 'Attribute statements back to source material.', group: 'session' },
];

const CAPABILITY_BY_ID = new Map(CAPABILITY_CATALOG.map((entry) => [entry.id, entry]));

export function capabilityDefinition(id: string): CapabilityDefinition | undefined {
  return CAPABILITY_BY_ID.get(id);
}

/** Human label for a capability id, falling back to the raw slug for custom ids. */
export function capabilityLabel(id: string): string {
  return CAPABILITY_BY_ID.get(id)?.label ?? id;
}

export function isKnownCapability(id: string): boolean {
  return CAPABILITY_BY_ID.has(id);
}

/** Slugify free text into a capability id so custom entries stay comparable. */
export function toCapabilityId(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Accepts the several shapes a capability list arrives in: catalog ids as bare
 * strings, `{ id, level }` records, or a comma-separated string typed by a
 * human. Unknown ids are kept — a skill may need something we have not modeled.
 */
export function normalizeCapabilities(value: unknown): SkillCapability[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]+/)
      : [];

  const byId = new Map<string, SkillCapability>();
  for (const entry of raw) {
    let id = '';
    let level: CapabilityLevel = 'required';
    let note: string | undefined;

    if (typeof entry === 'string') {
      id = toCapabilityId(entry);
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      id = toCapabilityId(String(record.id ?? record.capability ?? record.name ?? ''));
      const rawLevel = String(record.level ?? record.requirement ?? 'required').toLowerCase();
      level = rawLevel === 'preferred' || rawLevel === 'optional' ? 'preferred' : 'required';
      const rawNote = record.note ?? record.reason ?? record.detail;
      note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim() : undefined;
    }

    if (!id) continue;
    // A capability named twice keeps the stricter level.
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        id,
        level: existing.level === 'required' || level === 'required' ? 'required' : 'preferred',
        note: existing.note ?? note,
      });
    } else {
      byId.set(id, note ? { id, level, note } : { id, level });
    }
  }

  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Runtime profiles — what a given execution environment can actually do.
// ---------------------------------------------------------------------------

export type RuntimeProfile = {
  id: string;
  label: string;
  description: string;
  capabilities: string[];
};

/**
 * `preview-sandbox` is the profile the Preview pane really runs against: the
 * worker executes skills on a small text-only model, so a skill that requires
 * vision genuinely cannot be exercised there. The other profiles let an author
 * preflight the contract against the runtime they intend to ship to.
 */
export const RUNTIME_PROFILES: RuntimeProfile[] = [
  {
    id: 'preview-sandbox',
    label: 'Preview sandbox',
    description: 'The text-only model this workspace executes skills on.',
    capabilities: ['structured-output', 'streaming', 'multilingual'],
  },
  {
    id: 'text-only',
    label: 'Text-only chat model',
    description: 'Plain chat completion, no tools and no attachments.',
    capabilities: ['structured-output', 'streaming', 'multilingual', 'long-context'],
  },
  {
    id: 'tool-calling',
    label: 'Tool-calling assistant',
    description: 'Chat model with function calling and retrieval.',
    capabilities: [
      'structured-output', 'streaming', 'multilingual', 'long-context', 'extended-reasoning',
      'tool-use', 'parallel-tool-calls', 'web-search', 'citations', 'mcp-client',
    ],
  },
  {
    id: 'multimodal-agent',
    label: 'Multimodal agent runtime',
    description: 'Agent loop with vision, files, a sandbox, and a workspace.',
    capabilities: CAPABILITY_CATALOG.map((entry) => entry.id).filter((id) => id !== 'computer-use'),
  },
];

export const DEFAULT_RUNTIME_PROFILE_ID = 'preview-sandbox';

export function runtimeProfile(id: string): RuntimeProfile {
  return RUNTIME_PROFILES.find((profile) => profile.id === id) ?? RUNTIME_PROFILES[0];
}

export type CapabilityCheckEntry = SkillCapability & { supported: boolean };

export type CapabilityReport = {
  profileId: string;
  profileLabel: string;
  entries: CapabilityCheckEntry[];
  /** Required capabilities the runtime does not have. Non-empty blocks a run. */
  missingRequired: SkillCapability[];
  /** Preferred capabilities the runtime lacks. The run proceeds, degraded. */
  missingPreferred: SkillCapability[];
  satisfied: boolean;
};

/** Check a skill's declared contract against what a runtime actually offers. */
export function checkCapabilities(
  capabilities: SkillCapability[],
  profile: RuntimeProfile,
): CapabilityReport {
  const supportedIds = new Set(profile.capabilities);
  const entries: CapabilityCheckEntry[] = capabilities.map((capability) => ({
    ...capability,
    supported: supportedIds.has(capability.id),
  }));

  const missingRequired = entries.filter((e) => !e.supported && e.level === 'required');
  const missingPreferred = entries.filter((e) => !e.supported && e.level === 'preferred');

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    entries,
    missingRequired,
    missingPreferred,
    satisfied: missingRequired.length === 0,
  };
}
