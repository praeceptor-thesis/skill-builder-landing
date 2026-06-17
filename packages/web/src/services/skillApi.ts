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
};

export type SkillPayload = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  spec: SkillSpec;
  markdown: string;
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

export type AgentMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  createdAt?: string;
};

export type AgentActivity = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  operationType?: SkillOperationType;
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
  activity: AgentActivity[];
  message?: AgentMessage;
};

const apiBase =
  (import.meta.env.VITE_SKILL_API_URL as string | undefined) || 'https://skills.dmzagent.com/api';

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = options ?? {};
  const response = await fetch(`${apiBase}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) {
    throw new Error(body?.error?.message || response.statusText || 'Request failed');
  }

  return body.data as T;
}

export async function listSkills() {
  return requestJson('/skills');
}

export async function saveSkill(skill: SkillPayload) {
  return requestJson('/skills', {
    method: 'POST',
    body: JSON.stringify(skill),
  });
}

export async function createSkillBuilderSession(request: { skillId?: string; initialSpec?: Partial<SkillSpec>; intent?: string } = {}) {
  return requestJson('/skill-builder/session', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function sendSkillBuilderTurn(sessionId: string, request: SkillBuilderTurnRequest) {
  return requestJson<SkillBuilderTurnResponse>(`/skill-builder/session/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}
