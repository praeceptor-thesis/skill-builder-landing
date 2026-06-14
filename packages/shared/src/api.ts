import type {
  SkillListResponse,
  SkillResponse,
  SaveSkillResponse,
  ForkSkillResponse,
  ChatRequest,
  ChatResponse,
  ExecuteSkillRequest,
  ExecuteSkillResponse,
  AuthResponse,
  SkillPayload,
  RegistrySearchParams,
} from './types';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ ok: false, error: { message: response.statusText, code: 'PARSE_ERROR' } }));
  if (!body.ok) {
    throw new ApiClientError(body.error?.message || 'Request failed', response.status, body.error?.code);
  }
  return body.data as T;
}

export function createApiClient(baseUrl: string, token?: string) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers as Record<string, string> },
    });
    return handleResponse<T>(response);
  }

  return {
    listSkills: (params?: RegistrySearchParams) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && key !== 'signal') {
            if (Array.isArray(value)) value.forEach(v => searchParams.append(key, v));
            else searchParams.set(key, String(value));
          }
        });
      }
      const qs = searchParams.toString();
      return request<SkillListResponse>(`/skills${qs ? `?${qs}` : ''}`, { signal: params?.signal as AbortSignal | undefined });
    },
    getSkill: (id: string) => request<SkillResponse>(`/skills/${id}`),
    saveSkill: (skill: SkillPayload) =>
      request<SaveSkillResponse>('/skills', { method: 'POST', body: JSON.stringify(skill) }),
    forkSkill: (id: string, body?: { name?: string }) =>
      request<ForkSkillResponse>(`/skills/${id}/fork`, { method: 'POST', body: JSON.stringify(body || {}) }),
    chatAgent: (payload: ChatRequest) =>
      request<ChatResponse>('/agent/chat', { method: 'POST', body: JSON.stringify(payload) }),
    executeSkill: (id: string, payload: ExecuteSkillRequest) =>
      request<ExecuteSkillResponse>(`/skills/${id}/execute`, { method: 'POST', body: JSON.stringify(payload) }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (name: string, email: string, password: string, handle: string) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, handle }) }),
    getCurrentUser: () => request<{ user: import('./types').User }>('/auth/me'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
