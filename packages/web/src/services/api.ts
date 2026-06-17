type SkillApiImportMetaEnv = {
  DEV?: boolean;
  VITE_SKILL_API_URL?: string;
};

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

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

export type SkillType = 'basic' | 'meta';

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
  /**
   * Classification of the skill. A `meta` skill orchestrates other skills and
   * declares them in `dependencies`; a `basic` skill stands alone.
   */
  type?: SkillType;
  /**
   * Registry ids of skills this skill requires. When a meta skill is installed
   * the CLI resolves and installs every dependency. Always full ids, e.g.
   * `@handle/skill-id`.
   */
  dependencies?: string[];
};

export type SkillArtifacts = {
  metadata: Pick<SkillSpec, 'name' | 'description' | 'category' | 'tags'>;
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
  markdown: string;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /**
   * Canonical authored representation. The markdown field is rendered from this
   * AST and should not be treated as the source of truth by the builder UI.
   */
  spec: SkillSpec;
  /**
   * Generated artifact for registry display, exports, npm install output, and
   * older human-readable previews. The agent should mutate `spec`, not this.
   */
  markdown: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
  visibility?: 'public' | 'draft';
  /** 'basic' (standalone) or 'meta' (orchestrates dependencies). */
  type?: SkillType;
  /** Full registry ids of required skills (meta skills). */
  dependencies?: string[];
};

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
};

/** A single facet bucket: a value and how many skills carry it. */
export type TaxonomyFacet = {
  value: string;
  label?: string;
  count: number;
};

/** Faceted view of the whole registry, used to drive filters and counts. */
export type RegistryTaxonomy = {
  total: number;
  categories: TaxonomyFacet[];
  authors: TaxonomyFacet[];
  tags: TaxonomyFacet[];
  types: TaxonomyFacet[];
};

export type SkillSuggestionKind = 'skill' | 'tag' | 'author' | 'category';

/** A single autocomplete suggestion returned by the suggest endpoint. */
export type SkillSuggestion = {
  kind: SkillSuggestionKind;
  /** skill id, tag, author handle, or category name depending on kind. */
  value: string;
  label: string;
  category?: string;
  type?: SkillType;
  dependencies?: number;
  downloads?: number;
  count?: number;
};

export type SuggestResponse = {
  suggestions: SkillSuggestion[];
};

export type SkillListResponse = {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
  /** Present only when the request asks for facets (`facets=1`). */
  facets?: RegistryTaxonomy;
};

export type AgentMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  createdAt?: string;
};

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
  | 'set_markdown_artifact';

export type SkillOperation = {
  type: SkillOperationType;
  value?: unknown;
  reason?: string;
};

export type AgentActivityStatus = 'pending' | 'running' | 'done' | 'error';

export type AgentActivity = {
  id: string;
  label: string;
  status: AgentActivityStatus;
  detail?: string;
  operationType?: SkillOperationType;
};

export type SkillBuilderSession = {
  id: string;
  skillId?: string;
  spec: SkillSpec;
  artifacts: SkillArtifacts;
  messages: AgentMessage[];
  activity: AgentActivity[];
  createdAt: string;
  updatedAt: string;
};

export type CreateSkillBuilderSessionRequest = {
  skillId?: string;
  initialSpec?: Partial<SkillSpec>;
  intent?: string;
};

export type CreateSkillBuilderSessionResponse = {
  session: SkillBuilderSession;
};

export type SkillBuilderTurnRequest = {
  intent: string;
  currentSpec: SkillSpec;
  selectedSkillId?: string;
  messages?: AgentMessage[];
  clientMessageId?: string;
};

export type SkillBuilderTurnResponse = {
  sessionId: string;
  operations: SkillOperation[];
  spec: SkillSpec;
  artifacts: SkillArtifacts;
  activity: AgentActivity[];
  message?: AgentMessage;
};

export type ExecuteSkillRequest = {
  input: string;
  taskOutline?: string;
  spec?: SkillSpec;
};

export type ExecuteSkillResponse = {
  response: string;
  trace?: AgentActivity[];
};

export type User = {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatar?: string;
  createdAt: string;
};

export type AuthResponse = {
  user: User;
  token: string;
};

export type RegistrySearchParams = {
  query?: string;
  category?: string;
  tags?: string[];
  author?: string;
  type?: SkillType;
  sort?: 'recent' | 'popular' | 'downloads' | 'relevant';
  page?: number;
  pageSize?: number;
  /** Ask the list endpoint to also return registry-wide facet counts. */
  facets?: boolean;
};

const apiBase = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_SKILL_API_URL as string | undefined) || 'https://skills.dmzagent.com/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = options ?? {};
  const response = await fetch(url, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

  const body = await response
    .json()
    .catch(() => ({ ok: false, error: { code: 'PARSE_ERROR', message: response.statusText } }));

  if (!response.ok || !body.ok) {
    throw new ApiError(
      body.error?.message || 'Request failed',
      body.error?.code || (response.status === 401 ? 'AUTH_REQUIRED' : 'UNKNOWN'),
      response.status,
    );
  }

  return body.data as T;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toSearchParams(params?: RegistrySearchParams): string {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams.toString();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
    } else if (typeof value === 'boolean') {
      if (value) searchParams.set(key, '1');
    } else {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

export async function listSkills(params?: RegistrySearchParams & { signal?: AbortSignal }): Promise<SkillListResponse> {
  const { signal, ...registryParams } = params ?? {};
  const query = toSearchParams(registryParams);
  return fetchJson(`${apiBase}/skills${query ? `?${query}` : ''}`, { signal });
}

export async function getSkill(id: string): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}`);
}

export async function getTaxonomy(signal?: AbortSignal): Promise<RegistryTaxonomy> {
  return fetchJson(`${apiBase}/taxonomy`, { signal });
}

export async function suggestSkills(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SuggestResponse> {
  const params = new URLSearchParams({ q: query });
  if (options?.limit) params.set('limit', String(options.limit));
  return fetchJson(`${apiBase}/skills/suggest?${params.toString()}`, { signal: options?.signal });
}

/**
 * Resolve the full set of skills installed when `skill` is installed: the skill
 * itself plus every (transitive) dependency, deduped. Used by the UI to preview
 * a meta skill's footprint. Cycle-safe.
 */
export async function resolveSkillDependencies(skill: Skill): Promise<Skill[]> {
  const resolved = new Map<string, Skill>([[skill.id, skill]]);
  const queue = [...(skill.dependencies ?? [])];
  while (queue.length > 0) {
    const depId = queue.shift()!;
    if (resolved.has(depId)) continue;
    try {
      const { skill: dep } = await getSkill(depId);
      resolved.set(dep.id, dep);
      for (const next of dep.dependencies ?? []) {
        if (!resolved.has(next)) queue.push(next);
      }
    } catch {
      // Record a placeholder so the UI can flag an unresolved dependency.
      resolved.set(depId, { id: depId, name: depId, missing: true } as unknown as Skill);
    }
  }
  resolved.delete(skill.id);
  return [...resolved.values()];
}

export async function saveSkill(skill: SkillPayload): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(skill),
  });
}

export async function updateSkill(id: string, skill: Partial<SkillPayload>): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(skill),
  });
}

export async function forkSkill(id: string): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}/fork`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

export async function deleteSkill(id: string): Promise<{ success: boolean }> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
}

export async function updateSkillVisibility(id: string, visibility: 'public' | 'draft'): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ visibility }),
  });
}

export async function createSkillBuilderSession(
  request: CreateSkillBuilderSessionRequest = {},
): Promise<CreateSkillBuilderSessionResponse> {
  return fetchJson(`${apiBase}/skill-builder/session`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
}

export async function getSkillBuilderSession(sessionId: string): Promise<{ session: SkillBuilderSession }> {
  return fetchJson(`${apiBase}/skill-builder/session/${encodeURIComponent(sessionId)}`, {
    headers: getAuthHeaders(),
  });
}

export async function sendSkillBuilderTurn(
  sessionId: string,
  request: SkillBuilderTurnRequest,
): Promise<SkillBuilderTurnResponse> {
  return fetchJson(`${apiBase}/skill-builder/session/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
}

export async function executeSkill(id: string, request: ExecuteSkillRequest): Promise<ExecuteSkillResponse> {
  return fetchJson(`${apiBase}/skills/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return fetchJson(`${apiBase}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(name: string, email: string, password: string, handle: string): Promise<AuthResponse> {
  return fetchJson(`${apiBase}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name, email, password, handle }),
  });
}

export async function getCurrentUser(): Promise<{ user: User }> {
  return fetchJson(`${apiBase}/auth/me`, {
    headers: getAuthHeaders(),
  });
}

export function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('auth_token');
}

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function generateNpxCommand(skill: { id: string; authorHandle?: string }): string {
  const displayId = skill.id.startsWith('@') ? skill.id : skill.authorHandle ? `@${skill.authorHandle}/${skill.id}` : skill.id;
  return `npx @concordex-ai/skill-builder install ${displayId}`;
}

export function isUnauthorizedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (
      error.status === 401 ||
      error.code === 'AUTH_REQUIRED' ||
      error.code === 'AUTH_INVALID_TOKEN'
    )
  );
}