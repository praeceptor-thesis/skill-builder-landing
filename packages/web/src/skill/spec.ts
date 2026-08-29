/**
 * The canonical SkillSpec and the pure functions that shape it.
 *
 * The agent mutates a spec through operations; the editor mutates it through
 * field patches; markdown is a generated artifact of the spec, never a source
 * of truth. Everything here is pure so the studio can preview, diff, and
 * validate a spec without touching the network.
 */

import {
  normalizeCapabilities,
  type SkillCapability,
} from './capabilities';

export type SkillType = 'basic' | 'meta';

export type SkillExample = {
  title?: string;
  input: string;
  output: string;
};

export type SkillTest = {
  name: string;
  input: string;
  expected: string;
};

export type SkillSpec = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
  type?: SkillType;
  dependencies?: string[];
  /** Model abilities an invoker must have. See ./capabilities. */
  capabilities?: SkillCapability[];
};

export type SkillOperation = {
  type: string;
  value?: unknown;
  reason?: string;
  [key: string]: unknown;
};

export const CATEGORY_OPTIONS = [
  'Conversational',
  'Data',
  'Automation',
  'Utilities',
  'Healthcare',
  'Compliance',
  'Developer Tools',
  'Productivity',
  'Research',
  'Sales',
  'Support',
  'Education',
  'Finance',
  'Legal',
  'Security',
];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

export const createEmptySkillSpec = (): SkillSpec => ({
  name: '',
  description: '',
  category: 'Conversational',
  tags: [],
  purpose: '',
  instructions: [],
  promptTemplate: '',
  examples: [],
  tests: [],
  type: 'basic',
  dependencies: [],
  capabilities: [],
});

export const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return [];
};

/** Dependencies are skill ids; split on commas/whitespace/newlines and dedupe. */
export const parseDependencies = (value: unknown): string[] => {
  const raw = Array.isArray(value)
    ? value.map((v) => String(v))
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = item.trim();
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
};

/**
 * Fully qualify dependency ids against the owner's handle. Bare ids are scoped
 * to the owner; already-scoped ids (incl. cross-org @other/skill) are preserved.
 */
export const qualifyDependencies = (deps: string[] | undefined, ownerHandle?: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of deps ?? []) {
    const id = String(raw).trim();
    if (!id) continue;
    const qualified = id.startsWith('@') ? id : (ownerHandle ? `@${ownerHandle}/${id.replace(/^\/+/, '')}` : id);
    if (!seen.has(qualified)) { seen.add(qualified); out.push(qualified); }
  }
  return out;
};

export const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.replace(/^[-*]\s+|^\d+\.\s+/, '').trim())
      .filter(Boolean);
  }
  return [];
};

export const normalizeExamples = (value: unknown): SkillExample[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): SkillExample | null => {
      if (typeof item === 'string') {
        return { title: `Example ${index + 1}`, input: item, output: '' };
      }
      if (!isRecord(item)) return null;
      const input = asString(item.input ?? item.userInput ?? item.request);
      const output = asString(item.output ?? item.expectedOutput ?? item.response);
      const rawTitle = asString(item.title ?? item.name);
      // An entirely empty record is model junk; a row the author just added
      // carries its title, so it survives until they fill it in.
      if (!input && !output && !rawTitle) return null;
      return { title: rawTitle || `Example ${index + 1}`, input, output };
    })
    .filter((item): item is SkillExample => Boolean(item));
};

export const normalizeTests = (value: unknown): SkillTest[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): SkillTest | null => {
      if (!isRecord(item)) return null;
      const input = asString(item.input ?? item.given);
      const expected = asString(item.expected ?? item.expectedOutput ?? item.output ?? item.then);
      const rawName = asString(item.name ?? item.title);
      if (!input && !expected && !rawName) return null;
      return { name: rawName || `Test ${index + 1}`, input, expected };
    })
    .filter((item): item is SkillTest => Boolean(item));
};

/** A skill with dependencies is a meta skill whatever it claims to be. */
export const resolveSkillType = (explicit: unknown, dependencies: string[]): SkillType => {
  if (dependencies.length > 0) return 'meta';
  return asString(explicit).toLowerCase() === 'meta' ? 'meta' : 'basic';
};

export const normalizeSkillSpec = (
  value: unknown,
  fallback: SkillSpec = createEmptySkillSpec(),
): SkillSpec => {
  if (!isRecord(value)) return fallback;

  const dependencies = value.dependencies !== undefined
    ? parseDependencies(value.dependencies)
    : parseDependencies(fallback.dependencies);
  const capabilities = value.capabilities !== undefined
    ? normalizeCapabilities(value.capabilities)
    : normalizeCapabilities(fallback.capabilities);

  return {
    name: asString(value.name ?? value.title, fallback.name),
    description: asString(value.description ?? value.summary, fallback.description),
    category: asString(value.category ?? value.domain, fallback.category),
    tags: value.tags !== undefined ? parseTags(value.tags) : fallback.tags,
    purpose: asString(value.purpose ?? value.goal, fallback.purpose),
    instructions: value.instructions !== undefined
      ? normalizeStringArray(value.instructions)
      : fallback.instructions,
    promptTemplate: asString(
      value.promptTemplate ?? value.prompt_template ?? value.prompt ?? value.template,
      fallback.promptTemplate,
    ),
    examples: value.examples !== undefined ? normalizeExamples(value.examples) : fallback.examples,
    tests: value.tests !== undefined ? normalizeTests(value.tests) : fallback.tests,
    dependencies,
    capabilities,
    type: resolveSkillType(value.type ?? fallback.type, dependencies),
  };
};

// ---------------------------------------------------------------------------
// Markdown artifact
// ---------------------------------------------------------------------------

const getSection = (markdown: string, heading: string) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'));
  return match?.[1]?.trim() ?? '';
};

const stripCodeFence = (value: string) => {
  const match = value.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
  return (match?.[1] ?? value).trim();
};

/** Parse a `- **Tool use** (required) — note` bullet back into a capability. */
const capabilitiesFromMarkdown = (section: string): SkillCapability[] => {
  if (!section) return [];
  return normalizeCapabilities(
    section
      .split('\n')
      .map((line) => line.match(/^[-*]\s+`?([^`(—]+)`?\s*(?:\((required|preferred)\))?\s*(?:—\s*(.*))?$/i))
      .filter(Boolean)
      .map((match) => ({
        id: match![1].trim(),
        level: (match![2] ?? 'required').toLowerCase(),
        note: match![3]?.trim(),
      })),
  );
};

export const specFromMarkdown = (
  markdown: string,
  fallback: SkillSpec = createEmptySkillSpec(),
): SkillSpec => {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const category = markdown.match(/\*\*Category\*\*:\s*(.+)/i)?.[1]?.trim();
  const tags = markdown.match(/\*\*Tags\*\*:\s*(.+)/i)?.[1]?.trim();
  const quotedDescription = markdown.match(/^>\s+(.+)$/m)?.[1]?.trim();
  const purpose = getSection(markdown, 'Purpose');
  const instructionsRaw = getSection(markdown, 'Instructions');
  const promptTemplate = stripCodeFence(getSection(markdown, 'Prompt Template'));
  const examplesRaw = getSection(markdown, 'Examples');
  const testsRaw = getSection(markdown, 'Tests');
  const capabilities = capabilitiesFromMarkdown(getSection(markdown, 'Required capabilities'));

  return normalizeSkillSpec(
    {
      name: title ?? fallback.name,
      description: quotedDescription ?? fallback.description,
      category: category ?? fallback.category,
      tags: tags ? parseTags(tags) : fallback.tags,
      purpose: purpose || fallback.purpose,
      instructions: instructionsRaw ? normalizeStringArray(instructionsRaw) : fallback.instructions,
      promptTemplate: promptTemplate || fallback.promptTemplate,
      capabilities: capabilities.length ? capabilities : fallback.capabilities,
      examples: examplesRaw
        ? [{ title: 'Imported examples', input: examplesRaw, output: '' }]
        : fallback.examples,
      tests: testsRaw
        ? [{ name: 'Imported tests', input: testsRaw, expected: '' }]
        : fallback.tests,
    },
    fallback,
  );
};

export const specToMarkdown = (spec: SkillSpec) => {
  const safeTitle = spec.name || 'Untitled Skill';
  const tags = spec.tags.length ? spec.tags.join(', ') : 'draft';
  const instructions = spec.instructions.length
    ? spec.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
    : '- Define the operating instructions for this skill.';
  const examples = spec.examples.length
    ? spec.examples
        .map((example, index) => `### ${example.title || `Example ${index + 1}`}\n**Input**\n\n\`\`\`\n${example.input}\n\`\`\`\n\n**Output**\n\n\`\`\`\n${example.output}\n\`\`\``)
        .join('\n\n')
    : '_No examples generated yet._';
  const tests = spec.tests.length
    ? spec.tests
        .map((test, index) => `### ${test.name || `Test ${index + 1}`}\n**Input**\n\n\`\`\`\n${test.input}\n\`\`\`\n\n**Expected**\n\n\`\`\`\n${test.expected}\n\`\`\``)
        .join('\n\n')
    : '_No tests generated yet._';

  const capabilities = spec.capabilities ?? [];
  const capabilitySection = capabilities.length
    ? `\n## Required capabilities\n${capabilities
        .map((capability) => `- \`${capability.id}\` (${capability.level})${capability.note ? ` — ${capability.note}` : ''}`)
        .join('\n')}\n`
    : '';

  const dependencies = spec.dependencies ?? [];
  const dependencySection = spec.type === 'meta' && dependencies.length
    ? `\n## Dependencies\nInstalling this meta skill also installs:\n\n${dependencies.map((dep) => `- \`${dep}\``).join('\n')}\n`
    : '';

  return `# ${safeTitle}\n\n> ${spec.description || 'Draft skill description.'}\n\n**Category**: ${spec.category}\n**Tags**: ${tags}\n${capabilitySection}${dependencySection}\n## Purpose\n${spec.purpose || 'Define what this skill is responsible for producing.'}\n\n## Instructions\n${instructions}\n\n## Prompt Template\n\`\`\`\n${spec.promptTemplate || 'You are a reusable AI skill. Use the provided input to complete the task.\n\nInput: {{input}}'}\n\`\`\`\n\n## Examples\n${examples}\n\n## Tests\n${tests}\n`;
};

// ---------------------------------------------------------------------------
// Agent operations
// ---------------------------------------------------------------------------

export const applySkillOperationsToSpec = (current: SkillSpec, operations: SkillOperation[]) =>
  operations.reduce<SkillSpec>((draft, operation) => {
    const value = operation.value;

    switch (operation.type) {
      case 'replace_spec':
      case 'set_spec':
      case 'set_skill_spec':
        return normalizeSkillSpec(value, draft);
      case 'set_metadata':
        return normalizeSkillSpec({ ...draft, ...(isRecord(value) ? value : {}) }, draft);
      case 'set_name':
        return { ...draft, name: asString(value, draft.name) };
      case 'set_description':
        return { ...draft, description: asString(value, draft.description) };
      case 'set_category':
        return { ...draft, category: asString(value, draft.category) };
      case 'set_tags':
        return { ...draft, tags: parseTags(value) };
      case 'set_purpose':
        return { ...draft, purpose: asString(value, draft.purpose) };
      case 'set_instructions':
        return { ...draft, instructions: normalizeStringArray(value) };
      case 'append_instruction':
        return { ...draft, instructions: [...draft.instructions, asString(value)].filter(Boolean) };
      case 'set_prompt':
      case 'set_prompt_template':
        return { ...draft, promptTemplate: asString(value, draft.promptTemplate) };
      case 'set_examples':
        return { ...draft, examples: normalizeExamples(value) };
      case 'append_example':
        return { ...draft, examples: [...draft.examples, ...normalizeExamples([value])] };
      case 'set_tests':
        return { ...draft, tests: normalizeTests(value) };
      case 'append_test':
        return { ...draft, tests: [...draft.tests, ...normalizeTests([value])] };
      case 'set_capabilities':
        return { ...draft, capabilities: normalizeCapabilities(value) };
      case 'append_capability':
        return {
          ...draft,
          capabilities: normalizeCapabilities([...(draft.capabilities ?? []), ...normalizeCapabilities([value])]),
        };
      case 'set_dependencies': {
        const dependencies = parseDependencies(value);
        return { ...draft, dependencies, type: resolveSkillType(draft.type, dependencies) };
      }
      case 'set_type':
        return { ...draft, type: resolveSkillType(value, draft.dependencies ?? []) };
      default:
        return draft;
    }
  }, current);

export const operationLabel = (operation: SkillOperation) => {
  switch (operation.type) {
    case 'replace_spec':
    case 'set_spec':
    case 'set_skill_spec':
      return 'Rebuilt the SkillSpec';
    case 'set_metadata':
      return 'Updated metadata';
    case 'set_name':
      return 'Named the skill';
    case 'set_description':
      return 'Wrote the description';
    case 'set_category':
      return 'Chose a category';
    case 'set_tags':
      return 'Tagged the skill';
    case 'set_purpose':
      return 'Defined the purpose';
    case 'set_instructions':
      return 'Wrote the instructions';
    case 'append_instruction':
      return 'Added an instruction';
    case 'set_prompt':
    case 'set_prompt_template':
      return 'Authored the prompt template';
    case 'set_examples':
      return 'Generated examples';
    case 'append_example':
      return 'Added an example';
    case 'set_tests':
      return 'Generated tests';
    case 'append_test':
      return 'Added a test';
    case 'set_capabilities':
      return 'Declared required capabilities';
    case 'append_capability':
      return 'Added a required capability';
    case 'set_dependencies':
      return 'Wired up dependencies';
    case 'set_type':
      return 'Set the skill type';
    case 'set_markdown_artifact':
      return 'Regenerated the markdown artifact';
    default:
      return `Applied ${operation.type}`;
  }
};

export const operationDetail = (operation: SkillOperation) => {
  if (typeof operation.reason === 'string' && operation.reason.trim()) return operation.reason.trim();
  const value = operation.value;
  if (typeof value === 'string') return value.slice(0, 140);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return undefined;
};

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export type SpecRequirement = {
  id: string;
  label: string;
  done: boolean;
  /** Drawer section that fixes this gap. */
  section: string;
};

/**
 * The publish checklist. It doubles as the studio's progress meter, so it names
 * exactly the fields the worker validates before it will accept a save.
 */
export const specRequirements = (spec: SkillSpec): SpecRequirement[] => {
  const dependencies = spec.dependencies ?? [];
  const requirements: SpecRequirement[] = [
    { id: 'name', label: 'Name', done: Boolean(spec.name.trim()), section: 'identity' },
    { id: 'description', label: 'Description', done: Boolean(spec.description.trim()), section: 'identity' },
    { id: 'purpose', label: 'Purpose', done: Boolean(spec.purpose.trim()), section: 'behavior' },
    { id: 'instructions', label: 'Instructions', done: spec.instructions.length > 0, section: 'behavior' },
    { id: 'promptTemplate', label: 'Prompt template', done: Boolean(spec.promptTemplate.trim()), section: 'behavior' },
    { id: 'examples', label: 'At least one example', done: spec.examples.length > 0, section: 'examples' },
    { id: 'tests', label: 'At least one test', done: spec.tests.length > 0, section: 'examples' },
  ];

  if (spec.type === 'meta') {
    requirements.push({
      id: 'dependencies',
      label: 'Dependencies',
      done: dependencies.length > 0,
      section: 'architecture',
    });
  }

  return requirements;
};

export const specReadiness = (spec: SkillSpec) => {
  const requirements = specRequirements(spec);
  const done = requirements.filter((requirement) => requirement.done).length;
  return { requirements, done, total: requirements.length, complete: done === requirements.length };
};
