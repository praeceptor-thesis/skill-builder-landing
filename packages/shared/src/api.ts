import type {
  AuthResponse,
  CreateSkillBuilderSessionRequest,
  CreateSkillBuilderSessionResponse,
  ExecuteSkillRequest,
  ExecuteSkillResponse,
  ForkSkillResponse,
  RegistrySearchParams,
  SaveSkillResponse,
  SkillBuilderSession,
  SkillBuilderTurnRequest,
  SkillBuilderTurnResponse,
  SkillListResponse,
  SkillPayload,
  SkillResponse,
  User,
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
  const body = await response
    .json()
    .catch(() => ({ ok: false, error: { message: response.statusText, code: 'PARSE_ERROR' } }));

  if (!response.ok || body.ok !== true) {
    throw new ApiClientError(body.error?.message || response.statusText || 'Request failed', response.status, body.error?.code);
  }

  return body.data as T;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function toSearchParams(params?: RegistrySearchParams): string {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams.toString();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || key === 'signal') return;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
    } else {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

export function createApiClient(baseUrl: string, token?: string) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(joinUrl(baseUrl, path), {
      ...options,
      headers,
    });

    return handleResponse<T>(response);
  }

  return {
    listSkills: (params?: RegistrySearchParams) => {
      const query = toSearchParams(params);
      return request<SkillListResponse>(`/skills${query ? `?${query}` : ''}`, {
        signal: params?.signal,
      });
    },

    getSkill: (id: string) => request<SkillResponse>(`/skills/${encodeURIComponent(id)}`),

    saveSkill: (skill: SkillPayload) =>
      request<SaveSkillResponse>('/skills', {
        method: 'POST',
        body: JSON.stringify(skill),
      }),

    updateSkill: (id: string, skill: Partial<SkillPayload>) =>
      request<SkillResponse>(`/skills/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(skill),
      }),

    forkSkill: (id: string, body?: { name?: string }) =>
      request<ForkSkillResponse>(`/skills/${encodeURIComponent(id)}/fork`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),

    deleteSkill: (id: string) =>
      request<{ success: boolean }>(`/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),

    createSkillBuilderSession: (payload: CreateSkillBuilderSessionRequest = {}) =>
      request<CreateSkillBuilderSessionResponse>('/skill-builder/session', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getSkillBuilderSession: (sessionId: string) =>
      request<{ session: SkillBuilderSession }>(`/skill-builder/session/${encodeURIComponent(sessionId)}`),

    sendSkillBuilderTurn: (sessionId: string, payload: SkillBuilderTurnRequest) =>
      request<SkillBuilderTurnResponse>(`/skill-builder/session/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    executeSkill: (id: string, payload: ExecuteSkillRequest) =>
      request<ExecuteSkillResponse>(`/skills/${encodeURIComponent(id)}/execute`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    register: (name: string, email: string, password: string, handle: string) =>
      request<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, handle }),
      }),

    getCurrentUser: () => request<{ user: User }>('/auth/me'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
