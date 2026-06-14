export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
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
};

export type SkillPayload = Omit<Skill, 'id' | 'createdAt' | 'updatedAt' | 'downloads' | 'version' | 'author'> & {
  id: string;
  markdown: string;
};

export type SkillListResponse = {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
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
  sort?: 'recent' | 'popular' | 'downloads';
  page?: number;
  pageSize?: number;
};

const apiBase = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_SKILL_API_URL as string | undefined) || 'https://skills.eastern-shore-solutions.com/api';

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
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    signal: options?.signal,
    ...options,
  });
  const body = await response.json().catch(() => ({ ok: false, error: { code: 'PARSE_ERROR', message: response.statusText } }));
  if (!body.ok) {
    throw new ApiError(body.error?.message || 'Request failed', body.error?.code || 'UNKNOWN', response.status);
  }
  return body.data as T;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function listSkills(params?: RegistrySearchParams & { signal?: AbortSignal }): Promise<SkillListResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && key !== 'signal') {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, v));
        } else {
          searchParams.set(key, String(value));
        }
      }
    });
  }
  return fetchJson(`${apiBase}/skills?${searchParams.toString()}`, { signal: params?.signal });
}

export async function getSkill(id: string): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${id}`);
}

export async function saveSkill(skill: SkillPayload): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(skill),
  });
}

export async function updateSkill(id: string, skill: Partial<SkillPayload>): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(skill),
  });
}

export async function forkSkill(id: string): Promise<{ skill: Skill }> {
  return fetchJson(`${apiBase}/skills/${id}/fork`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
}

export async function deleteSkill(id: string): Promise<{ success: boolean } | void> {
  return fetchJson(`${apiBase}/skills/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
}

export async function chatAgent(request: ChatRequest): Promise<ChatResponse> {
  return fetchJson(`${apiBase}/agent/chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
}

export async function executeSkill(id: string, request: ExecuteSkillRequest): Promise<ExecuteSkillResponse> {
  return fetchJson(`${apiBase}/skills/${id}/execute`, {
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
  const prefix = skill.authorHandle ? `@${skill.authorHandle}/` : '';
  return `npx skill-builder install ${prefix}${skill.id}`;
}