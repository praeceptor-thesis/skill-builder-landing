export interface SkillExample {
  title?: string;
  input: string;
  output: string;
}

export interface SkillTest {
  name: string;
  input: string;
  expected: string;
}

export type SkillType = 'basic' | 'meta';

export type CapabilityLevel = 'required' | 'preferred';

/**
 * A model ability an invoker must have to run a skill. `required` gates
 * execution; `preferred` only degrades it. Ids come from the shared capability
 * catalog, but custom slugs are preserved so a skill can name an ability the
 * catalog does not model yet.
 */
export interface SkillCapability {
  id: string;
  level: CapabilityLevel;
  note?: string;
}

export const CAPABILITY_CATALOG_IDS = [
  'vision', 'audio-input', 'file-input', 'structured-output', 'streaming',
  'extended-reasoning', 'long-context', 'multilingual',
  'tool-use', 'parallel-tool-calls', 'code-execution', 'web-search', 'file-system',
  'computer-use', 'mcp-client',
  'persistent-memory', 'citations',
] as const;

export interface SkillSpec {
  name: string;
  description: string;
  category: string;
  tags: string[];
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
  /** 'basic' (standalone) or 'meta' (orchestrates `dependencies`). */
  type?: SkillType;
  /** Full registry ids of required skills, installed alongside a meta skill. */
  dependencies?: string[];
  /** Model capabilities required to invoke this skill. */
  capabilities?: SkillCapability[];
}

export interface SkillArtifacts {
  metadata: Pick<SkillSpec, 'name' | 'description' | 'category' | 'tags'>;
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
  markdown: string;
}

/**
 * Who can see a skill. 'public' is world-readable; 'draft' (unfinished) and
 * 'private' (finished, deliberately restricted) are owner-only across every
 * read path — list, fetch, suggest, taxonomy, fork, execute. Skills published
 * from DMZAgent for agent orchestration (source: 'dmzagent-orchestration')
 * are created private; making one public is an explicit act via
 * PATCH /api/skills/:id/visibility, never a publish side effect.
 */
export type SkillVisibility = 'public' | 'draft' | 'private';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /**
   * Canonical authored representation. Builder agents mutate this structure;
   * markdown is treated as a generated artifact, not the source of truth.
   */
  spec: SkillSpec;
  markdown: string;
  author: { id: string; name: string; avatar?: string };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
  type?: SkillType;
  dependencies?: string[];
  capabilities?: SkillCapability[];
  visibility?: SkillVisibility;
  /** Provenance of the publish, e.g. 'dmzagent-orchestration'. */
  source?: string;
}

export type SkillPayload = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  spec: SkillSpec;
  markdown: string;
  authorHandle?: string;
  forkedFrom?: string;
  type?: SkillType;
  dependencies?: string[];
  capabilities?: SkillCapability[];
  visibility?: SkillVisibility;
  source?: string;
};

export interface TaxonomyFacet {
  value: string;
  label?: string;
  count: number;
}

export interface RegistryTaxonomy {
  total: number;
  categories: TaxonomyFacet[];
  authors: TaxonomyFacet[];
  tags: TaxonomyFacet[];
  types: TaxonomyFacet[];
}

export type SkillSuggestionKind = 'skill' | 'tag' | 'author' | 'category';

export interface SkillSuggestion {
  kind: SkillSuggestionKind;
  value: string;
  label: string;
  category?: string;
  type?: SkillType;
  dependencies?: number;
  downloads?: number;
  count?: number;
}

export interface SuggestResponse {
  suggestions: SkillSuggestion[];
}

export interface SkillListResponse {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
  facets?: RegistryTaxonomy;
}

export interface SkillResponse {
  skill: Skill;
}

export type SaveSkillResponse = { success: boolean; skill: Skill };
export type ForkSkillResponse = { success: boolean; skill: Skill };

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  createdAt?: string;
}

export type SkillOperationType =
  | 'replace_spec'
  | 'set_spec'
  | 'set_skill_spec'
  | 'set_metadata'
  | 'set_name'
  | 'set_description'
  | 'set_category'
  | 'set_tags'
  | 'set_purpose'
  | 'set_instructions'
  | 'append_instruction'
  | 'set_prompt'
  | 'set_prompt_template'
  | 'set_examples'
  | 'append_example'
  | 'set_tests'
  | 'append_test'
  | 'set_capabilities'
  | 'append_capability'
  | 'set_markdown_artifact';

export interface SkillOperation {
  type: SkillOperationType;
  value?: unknown;
  reason?: string;
}

export type AgentActivityStatus = 'pending' | 'running' | 'done' | 'error';

export interface AgentActivity {
  id: string;
  label: string;
  status: AgentActivityStatus;
  detail?: string;
  operationType?: SkillOperationType;
}

export interface SkillBuilderSession {
  id: string;
  skillId?: string;
  spec: SkillSpec;
  artifacts: SkillArtifacts;
  messages: AgentMessage[];
  activity: AgentActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillBuilderSessionRequest {
  skillId?: string;
  initialSpec?: Partial<SkillSpec>;
  intent?: string;
}

export interface CreateSkillBuilderSessionResponse {
  session: SkillBuilderSession;
}

export interface SkillBuilderTurnRequest {
  intent: string;
  currentSpec: SkillSpec;
  selectedSkillId?: string;
  messages?: AgentMessage[];
  clientMessageId?: string;
}

export interface SkillBuilderTurnResponse {
  sessionId: string;
  operations: SkillOperation[];
  spec: SkillSpec;
  artifacts: SkillArtifacts;
  activity: AgentActivity[];
  message?: AgentMessage;
}

export interface ExecuteSkillRequest {
  input: string;
  taskOutline?: string;
  spec?: SkillSpec;
  /** Run even when the runtime lacks a capability the skill requires. */
  force?: boolean;
}

/** What a given execution runtime can actually do. */
export interface RuntimeProfile {
  id: string;
  label: string;
  description: string;
  model?: string;
  capabilities: string[];
}

export interface CapabilityReport {
  profileId: string;
  profileLabel: string;
  missingRequired: SkillCapability[];
  missingPreferred: SkillCapability[];
  satisfied: boolean;
}

export interface ExecuteSkillResponse {
  response: string;
  trace?: AgentActivity[];
  capabilityReport?: CapabilityReport;
  degraded?: boolean;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegistrySearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  author?: string;
  type?: SkillType;
  sort?: 'recent' | 'popular' | 'downloads' | 'relevant';
  page?: number;
  pageSize?: number;
  facets?: boolean;
  signal?: AbortSignal;
}

export type SkillCategory =
  | 'Conversational'
  | 'Data'
  | 'Automation'
  | 'Utilities'
  | 'Healthcare'
  | 'Compliance'
  | 'Developer Tools'
  | 'Productivity'
  | 'Research'
  | 'Sales'
  | 'Support'
  | 'Education'
  | 'Finance'
  | 'Legal'
  | 'Security';

export const SKILL_CATEGORIES: SkillCategory[] = [
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

export function isSkillCategory(value: string): value is SkillCategory {
  return SKILL_CATEGORIES.includes(value as SkillCategory);
}

export function createEmptySkillSpec(overrides: Partial<SkillSpec> = {}): SkillSpec {
  return {
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
    ...overrides,
  };
}

export function validateSkillSpec(spec: Partial<SkillSpec>): string[] {
  const errors: string[] = [];
  if (!spec.name?.trim()) errors.push('Skill name is required');
  if (!spec.description?.trim()) errors.push('Description is required');
  if (!spec.category?.trim()) errors.push('Category is required');
  if (!spec.purpose?.trim()) errors.push('Purpose is required');
  if (!Array.isArray(spec.tags)) errors.push('Tags must be an array');
  if (!Array.isArray(spec.instructions) || spec.instructions.length === 0) errors.push('At least one instruction is required');
  if (!spec.promptTemplate?.trim()) errors.push('Prompt template is required');
  if (!Array.isArray(spec.examples)) errors.push('Examples must be an array');
  if (!Array.isArray(spec.tests)) errors.push('Tests must be an array');
  return errors;
}

export function validateSkill(skill: Partial<SkillPayload>): string[] {
  const errors: string[] = [];
  if (!skill.id?.trim()) errors.push('Skill ID is required');
  if (!skill.name?.trim()) errors.push('Skill name is required');
  if (!skill.description?.trim()) errors.push('Description is required');
  if (!skill.category?.trim()) errors.push('Category is required');
  if (!Array.isArray(skill.tags)) errors.push('Tags must be an array');
  if (!skill.spec) errors.push('Skill spec is required');
  else errors.push(...validateSkillSpec(skill.spec));
  if (!skill.markdown?.trim()) errors.push('Generated markdown artifact is required');
  return errors;
}
