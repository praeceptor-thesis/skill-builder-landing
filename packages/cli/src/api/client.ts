export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  markdown: string;
  author?: { id: string; name: string; email?: string };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
};

export type SkillPayload = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  markdown: string;
  author?: { id: string; name: string };
};

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
  sort?: 'recent' | 'popular' | 'downloads';
  page?: number;
  pageSize?: number;
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

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.SKILL_API_URL || 'https://skills.dmzagent.com/api';
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
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, v));
          } else {
            searchParams.set(key, String(value));
          }
        }
      });
    }
    const qs = searchParams.toString();
    return this.request(`/skills${qs ? `?${qs}` : ''}`);
  }

  async getSkill(id: string): Promise<GetSkillResponse> {
    return this.request(`/skills/${id}`);
  }

  async saveSkill(skill: SkillPayload): Promise<SaveSkillResponse> {
    return this.request('/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
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
