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
  /** 'basic' (standalone) or 'meta' (orchestrates `dependencies`). */
  type?: SkillType;
  /** Full registry ids of required skills, installed alongside a meta skill. */
  dependencies?: string[];
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  spec?: SkillSpec;
  markdown: string;
  author?: { id: string; name: string; email?: string };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
  type?: SkillType;
  dependencies?: string[];
};

export type SkillPayload = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /**
   * Structured spec. The deployed Worker requires this for POST /api/skills and
   * validates it; markdown alone is rejected.
   */
  spec?: SkillSpec;
  markdown: string;
  version?: number;
  author?: { id: string; name: string };
  type?: SkillType;
  dependencies?: string[];
};

export type TaxonomyFacet = { value: string; label?: string; count: number };

export type RegistryTaxonomy = {
  total: number;
  categories: TaxonomyFacet[];
  authors: TaxonomyFacet[];
  tags: TaxonomyFacet[];
  types: TaxonomyFacet[];
};

export type SkillSuggestionKind = 'skill' | 'tag' | 'author' | 'category';

export type SkillSuggestion = {
  kind: SkillSuggestionKind;
  value: string;
  label: string;
  category?: string;
  type?: SkillType;
  dependencies?: number;
  downloads?: number;
  count?: number;
};

export type SuggestResponse = { suggestions: SkillSuggestion[] };

export type AgentMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export type ChatRequest = {
  messages: AgentMessage[];
  skillId?: string;
  taskOutline?: string;
};

export type ChatResponse = {
  response: string;
};

export type ExecuteSkillRequest = {
  input: string;
  taskOutline?: string;
};

export type ExecuteSkillResponse = {
  response: string;
};

export type ListSkillsResponse = {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
  facets?: RegistryTaxonomy;
};

export type GetSkillResponse = {
  skill: Skill;
};

export type SaveSkillResponse = {
  success: boolean;
  skill: Skill;
};

export type ForkSkillResponse = {
  success: boolean;
  skill: Skill;
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
  facets?: boolean;
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

export type SkillBuilderSession = {
  id: string;
  spec: SkillSpec;
  artifacts: { markdown: string };
};

export type CreateSessionResponse = {
  session: SkillBuilderSession;
};

export type SkillBuilderTurnResponse = {
  sessionId: string;
  spec: SkillSpec;
  artifacts: { markdown: string };
  message?: { role: string; text: string };
};

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.SKILL_API_URL || 'https://skills.eastern-shore-solutions.com/api';
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      headers: { ...headers, ...options?.headers },
      ...options,
    });

    const body = await response.json().catch(() => ({ ok: false, error: { message: response.statusText } }));
    if (!body.ok) {
      throw new Error(body.error?.message || `Request failed: ${response.status}`);
    }

    return body.data as T;
  }

  async listSkills(params?: RegistrySearchParams): Promise<ListSkillsResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined) return;
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else if (typeof value === 'boolean') {
          if (value) searchParams.set(key, '1');
        } else {
          searchParams.set(key, String(value));
        }
      });
    }
    const qs = searchParams.toString();
    return this.request(`/skills${qs ? `?${qs}` : ''}`);
  }

  async getSkill(id: string): Promise<GetSkillResponse> {
    return this.request(`/skills/${encodeURIComponent(id)}`);
  }

  async getTaxonomy(): Promise<RegistryTaxonomy> {
    return this.request('/taxonomy');
  }

  async suggest(query: string, limit?: number): Promise<SuggestResponse> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set('limit', String(limit));
    return this.request(`/skills/suggest?${params.toString()}`);
  }

  async saveSkill(skill: SkillPayload): Promise<SaveSkillResponse> {
    return this.request('/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    });
  }

  async createSkillBuilderSession(payload: { intent?: string; initialSpec?: Partial<SkillSpec> } = {}): Promise<CreateSessionResponse> {
    return this.request('/skill-builder/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async skillBuilderTurn(
    sessionId: string,
    payload: { intent: string; currentSpec: SkillSpec; clientMessageId?: string },
  ): Promise<SkillBuilderTurnResponse> {
    return this.request(`/skill-builder/session/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async forkSkill(id: string, body?: { name?: string; author?: { id: string; name: string } }): Promise<ForkSkillResponse> {
    return this.request(`/skills/${id}/fork`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  async chatAgent(request: ChatRequest): Promise<ChatResponse> {
    return this.request('/agent/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async executeSkill(id: string, request: ExecuteSkillRequest): Promise<ExecuteSkillResponse> {
    return this.request(`/skills/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(name: string, email: string, password: string, handle: string): Promise<AuthResponse> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, handle }),
    });
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request('/auth/me');
  }
}

export const apiClient = new ApiClient();

export function createApiClient(baseUrl: string): ApiClient {
  return new ApiClient(baseUrl);
}
