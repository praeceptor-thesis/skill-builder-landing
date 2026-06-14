const jsonHeaders = {
  'Content-Type': 'application/json;charset=UTF-8',
};

function ok(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: jsonHeaders });
}

function err(code, message, status = 400, detail) {
  const payload = { ok: false, error: { code, message } };
  if (detail !== undefined) payload.error.detail = detail;
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

const SKILL_OPERATION_TYPES = new Set([
  'replace_spec',
  'set_spec',
  'set_skill_spec',
  'set_metadata',
  'set_name',
  'set_description',
  'set_category',
  'set_tags',
  'set_purpose',
  'set_instructions',
  'append_instruction',
  'set_prompt',
  'set_prompt_template',
  'set_examples',
  'append_example',
  'set_tests',
  'append_test',
  'set_markdown_artifact',
]);

async function hashPassword(password, saltBytes) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256,
  );
  return {
    hash: Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join(''),
    saltHex: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
  };
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function generateToken() {
  return crypto.randomUUID();
}

function parseSkillId(raw) {
  if (!raw) return raw;
  if (raw.startsWith('@')) return raw.slice(raw.indexOf('/') + 1);
  return decodeURIComponent(raw);
}

async function getUserFromToken(token, SKILL_STORE) {
  if (!token) return null;
  const userId = await SKILL_STORE.get(`tokens/${token}`);
  if (!userId) return null;
  return SKILL_STORE.get(`users/${userId}`, { type: 'json' });
}

async function runInference(ai, messages, options = {}) {
  return ai.run(MODEL, {
    messages,
    ...options,
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\n|,/)
      .map(item => item.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeTags(value) {
  return normalizeStringArray(value).map(tag => tag.toLowerCase().replace(/^#/, '')).filter(Boolean);
}

function normalizeExamples(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { input: item, output: '' };
      if (!isRecord(item)) return null;
      return {
        title: asString(item.title) || undefined,
        input: asString(item.input),
        output: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
      };
    })
    .filter(item => item && (item.input || item.output));
}

function normalizeTests(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') return { name: `Test ${index + 1}`, input: item, expected: '' };
      if (!isRecord(item)) return null;
      return {
        name: asString(item.name) || `Test ${index + 1}`,
        input: asString(item.input),
        expected: typeof item.expected === 'string' ? item.expected : JSON.stringify(item.expected ?? ''),
      };
    })
    .filter(item => item && (item.input || item.expected));
}

function createEmptySkillSpec(overrides = {}) {
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
    ...overrides,
  };
}

function normalizeSkillSpec(value, fallback = createEmptySkillSpec()) {
  const source = isRecord(value) ? value : {};
  return {
    name: asString(source.name) || fallback.name || '',
    description: asString(source.description) || fallback.description || '',
    category: asString(source.category) || fallback.category || 'Conversational',
    tags: source.tags !== undefined ? normalizeTags(source.tags) : normalizeTags(fallback.tags),
    purpose: asString(source.purpose) || fallback.purpose || '',
    instructions: source.instructions !== undefined ? normalizeStringArray(source.instructions) : normalizeStringArray(fallback.instructions),
    promptTemplate: asString(source.promptTemplate ?? source.prompt ?? source.prompt_template) || fallback.promptTemplate || '',
    examples: source.examples !== undefined ? normalizeExamples(source.examples) : normalizeExamples(fallback.examples),
    tests: source.tests !== undefined ? normalizeTests(source.tests) : normalizeTests(fallback.tests),
  };
}

function specToMarkdown(spec) {
  const normalized = normalizeSkillSpec(spec);
  const lines = [
    `# ${normalized.name || 'Untitled Skill'}`,
    '',
    '## Purpose',
    normalized.purpose || normalized.description || 'Describe the skill purpose.',
    '',
    '## Instructions',
    ...(normalized.instructions.length > 0
      ? normalized.instructions.map((instruction, index) => `${index + 1}. ${instruction}`)
      : ['1. Define how this skill should behave.']),
    '',
    '## Prompt Template',
    '```',
    normalized.promptTemplate || 'Use the provided input to complete the task.',
    '```',
  ];

  if (normalized.examples.length > 0) {
    lines.push('', '## Examples');
    normalized.examples.forEach((example, index) => {
      lines.push(
        '',
        `### Example ${index + 1}${example.title ? `: ${example.title}` : ''}`,
        `**Input**: ${example.input}`,
        '',
        `**Output**: ${example.output}`,
      );
    });
  }

  if (normalized.tests.length > 0) {
    lines.push('', '## Tests');
    normalized.tests.forEach((test, index) => {
      lines.push(
        '',
        `### ${test.name || `Test ${index + 1}`}`,
        `**Input**: ${test.input}`,
        '',
        `**Expected**: ${test.expected}`,
      );
    });
  }

  return lines.join('\n').trim() + '\n';
}

function buildArtifacts(spec) {
  const normalized = normalizeSkillSpec(spec);
  return {
    metadata: {
      name: normalized.name,
      description: normalized.description,
      category: normalized.category,
      tags: normalized.tags,
    },
    purpose: normalized.purpose,
    instructions: normalized.instructions,
    promptTemplate: normalized.promptTemplate,
    examples: normalized.examples,
    tests: normalized.tests,
    markdown: specToMarkdown(normalized),
  };
}

function validateSkillSpec(spec) {
  const errors = [];
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

function applySkillOperation(spec, operation) {
  const current = normalizeSkillSpec(spec);
  if (!isRecord(operation) || typeof operation.type !== 'string') return current;

  const value = operation.value;
  switch (operation.type) {
    case 'replace_spec':
    case 'set_spec':
    case 'set_skill_spec':
      return normalizeSkillSpec(value, current);
    case 'set_metadata':
      return normalizeSkillSpec({ ...current, ...(isRecord(value) ? value : {}) }, current);
    case 'set_name':
      return { ...current, name: asString(value) };
    case 'set_description':
      return { ...current, description: asString(value) };
    case 'set_category':
      return { ...current, category: asString(value) || current.category };
    case 'set_tags':
      return { ...current, tags: normalizeTags(value) };
    case 'set_purpose':
      return { ...current, purpose: asString(value) };
    case 'set_instructions':
      return { ...current, instructions: normalizeStringArray(value) };
    case 'append_instruction':
      return { ...current, instructions: [...current.instructions, asString(value)].filter(Boolean) };
    case 'set_prompt':
    case 'set_prompt_template':
      return { ...current, promptTemplate: asString(value) };
    case 'set_examples':
      return { ...current, examples: normalizeExamples(value) };
    case 'append_example':
      return { ...current, examples: [...current.examples, ...normalizeExamples([value])] };
    case 'set_tests':
      return { ...current, tests: normalizeTests(value) };
    case 'append_test':
      return { ...current, tests: [...current.tests, ...normalizeTests([value])] };
    case 'set_markdown_artifact':
      return current;
    default:
      return current;
  }
}

function applySkillOperations(spec, operations) {
  return operations.reduce((draft, operation) => applySkillOperation(draft, operation), normalizeSkillSpec(spec));
}

function normalizeOperation(raw) {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;
  if (!SKILL_OPERATION_TYPES.has(raw.type)) return null;
  return {
    type: raw.type,
    value: raw.value,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  };
}

function extractJsonObject(text) {
  const raw = asString(text).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Fall through and try to extract the first balanced JSON object.
  }

  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      const candidate = raw.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function parseBuilderModelOutput(outputText) {
  const payload = extractJsonObject(outputText);
  if (!payload) return { operations: [], activity: [], assistantText: '' };

  if (Array.isArray(payload)) {
    return {
      operations: payload.map(normalizeOperation).filter(Boolean),
      activity: [],
      assistantText: '',
    };
  }

  const operations = Array.isArray(payload.operations)
    ? payload.operations.map(normalizeOperation).filter(Boolean)
    : [];

  const looksLikeSpec = ['name', 'description', 'category', 'purpose', 'instructions', 'promptTemplate'].some(key => key in payload);
  const spec = isRecord(payload.spec) ? payload.spec : looksLikeSpec ? payload : undefined;

  return {
    operations,
    spec,
    activity: Array.isArray(payload.activity) ? payload.activity.map(normalizeActivity).filter(Boolean) : [],
    assistantText: asString(payload.message || payload.summary || payload.assistantText),
  };
}

function operationLabel(operation) {
  switch (operation.type) {
    case 'replace_spec':
    case 'set_spec':
    case 'set_skill_spec':
      return 'Generated complete SkillSpec';
    case 'set_metadata':
      return 'Generated metadata';
    case 'set_name':
      return 'Determined skill name';
    case 'set_description':
      return 'Generated description';
    case 'set_category':
      return 'Determined category';
    case 'set_tags':
      return 'Generated tags';
    case 'set_purpose':
      return 'Generated purpose';
    case 'set_instructions':
    case 'append_instruction':
      return 'Generated instructions';
    case 'set_prompt':
    case 'set_prompt_template':
      return 'Generated prompt template';
    case 'set_examples':
    case 'append_example':
      return 'Generated examples';
    case 'set_tests':
    case 'append_test':
      return 'Generated tests';
    case 'set_markdown_artifact':
      return 'Generated markdown artifact';
    default:
      return 'Applied state operation';
  }
}

function operationDetail(operation) {
  if (typeof operation.reason === 'string' && operation.reason.trim()) return operation.reason.trim();
  if (typeof operation.value === 'string') return operation.value.slice(0, 180);
  if (Array.isArray(operation.value)) return `${operation.value.length} item${operation.value.length === 1 ? '' : 's'}`;
  if (isRecord(operation.value)) return Object.keys(operation.value).join(', ');
  return undefined;
}

function normalizeActivity(raw, index = 0) {
  if (!isRecord(raw)) return null;
  const status = ['pending', 'running', 'done', 'error'].includes(raw.status) ? raw.status : 'done';
  return {
    id: asString(raw.id) || `activity-${Date.now()}-${index}`,
    label: asString(raw.label) || 'Applied state operation',
    status,
    detail: asString(raw.detail) || undefined,
    operationType: SKILL_OPERATION_TYPES.has(raw.operationType) ? raw.operationType : undefined,
  };
}

function activityFromOperations(operations, runId) {
  return operations.map((operation, index) => ({
    id: `${runId}-op-${index}`,
    label: operationLabel(operation),
    status: 'done',
    detail: operationDetail(operation),
    operationType: operation.type,
  }));
}

function buildSkillArchitectMessages(intent, currentSpec, messages = []) {
  const recentConversation = Array.isArray(messages)
    ? messages.slice(-8).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: asString(message.text),
      })).filter(message => message.content)
    : [];

  return [
    {
      role: 'system',
      content: `You are Skill Architect, an agent that builds reusable AI skills by producing structured state mutations.

Do not write markdown. Do not write prose outside JSON. Return one valid JSON object only.

Your JSON response must match this shape:
{
  "operations": [
    { "type": "set_name", "value": "...", "reason": "..." },
    { "type": "set_category", "value": "...", "reason": "..." },
    { "type": "set_description", "value": "...", "reason": "..." },
    { "type": "set_tags", "value": ["tag"], "reason": "..." },
    { "type": "set_purpose", "value": "...", "reason": "..." },
    { "type": "set_instructions", "value": ["instruction"], "reason": "..." },
    { "type": "set_prompt_template", "value": "...", "reason": "..." },
    { "type": "set_examples", "value": [{ "title": "...", "input": "...", "output": "..." }], "reason": "..." },
    { "type": "set_tests", "value": [{ "name": "...", "input": "...", "expected": "..." }], "reason": "..." }
  ],
  "activity": [
    { "id": "activity-name", "label": "Determined category", "status": "done", "detail": "...", "operationType": "set_category" }
  ],
  "message": "Applied structured updates to the skill spec."
}

Allowed operation types: ${Array.from(SKILL_OPERATION_TYPES).join(', ')}.

Rules:
- Prefer several granular operations over a single markdown document.
- Preserve existing useful fields unless the user asks to replace them.
- Create production-ready prompt templates with {{input}} and other obvious placeholders.
- Examples must have input and output.
- Tests must have name, input, and expected.
- Category should be concise, such as Healthcare, Compliance, Developer Tools, Data, Automation, Utilities, Sales, Support, Education, Finance, Legal, Security, Research, or Productivity.`,
    },
    {
      role: 'user',
      content: `Current SkillSpec JSON:\n${JSON.stringify(normalizeSkillSpec(currentSpec), null, 2)}\n\nUser intent:\n${intent}`,
    },
    ...recentConversation,
  ];
}

function buildSkillExecutionPrompt(skill, userInput, taskOutline, requestSpec) {
  const spec = normalizeSkillSpec(requestSpec || skill.spec);
  return `Execute the following skill using its canonical SkillSpec.

SkillSpec:
${JSON.stringify(spec, null, 2)}

Generated Markdown Artifact:
${skill.markdown || specToMarkdown(spec)}

Task Context: ${taskOutline || 'No specific task outline provided.'}

User Input: ${userInput}

Follow the SkillSpec instructions and prompt template precisely. Return only the execution result.`;
}

async function executeSkill(AI, skill, userInput, taskOutline, requestSpec) {
  const prompt = buildSkillExecutionPrompt(skill, userInput, taskOutline, requestSpec);

  const messages = [
    { role: 'system', content: 'You execute a specific reusable AI skill. Follow the canonical SkillSpec precisely.' },
    { role: 'user', content: prompt },
  ];

  const response = await runInference(AI, messages, {
    temperature: 0.5,
    max_tokens: 2048,
  });

  return typeof response.response === 'string' ? response.response : response.response?.response || '';
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/api\//, '');
  const { SKILL_STORE, AI } = env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (url.pathname === '/api/skills' && request.method === 'GET') {
    return listSkills(SKILL_STORE, url);
  }

  if (url.pathname === '/api/skills' && request.method === 'POST') {
    return saveSkill(request, SKILL_STORE);
  }

  if (url.pathname === '/api/skill-builder/session' && request.method === 'POST') {
    return createSkillBuilderSession(request, SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skill-builder/session/')) {
    const sessionId = url.pathname.replace('/api/skill-builder/session/', '');
    if (request.method === 'GET') return getSkillBuilderSession(sessionId, SKILL_STORE);
    if (request.method === 'POST') return handleSkillBuilderTurn(request, sessionId, SKILL_STORE, AI);
  }

  if (request.method === 'GET' && key.startsWith('skills/')) {
    return fetchSkill(key.replace(/^skills\//, ''), SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/fork') && request.method === 'POST') {
    const skillId = url.pathname.replace('/api/skills/', '').replace('/fork', '');
    return forkSkill(request, skillId, SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/execute') && request.method === 'POST') {
    const skillId = url.pathname.replace('/api/skills/', '').replace('/execute', '');
    return handleSkillExecute(request, skillId, SKILL_STORE, AI);
  }

  if (url.pathname.startsWith('/api/skills/') && request.method === 'PATCH' && !url.pathname.replace('/api/skills/', '').includes('/')) {
    const skillId = url.pathname.replace('/api/skills/', '');
    return updateSkill(request, skillId, SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && request.method === 'DELETE' && !url.pathname.replace('/api/skills/', '').includes('/')) {
    const skillId = url.pathname.replace('/api/skills/', '');
    return deleteSkill(request, skillId, SKILL_STORE);
  }

  if (url.pathname === '/api/auth/register' && request.method === 'POST') {
    return handleAuthRegister(request, SKILL_STORE);
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return handleAuthLogin(request, SKILL_STORE);
  }

  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    return handleAuthMe(request, SKILL_STORE);
  }

  return err('NOT_FOUND', 'Not found', 404);
}

async function handleAuthRegister(request, SKILL_STORE) {
  try {
    const { name, email: rawEmail, password, handle: rawHandle } = await request.json();
    const email = rawEmail?.toLowerCase().trim();
    const handle = rawHandle?.toLowerCase().trim();
    if (!name || !email || !password || !handle) return err('VALIDATION_REQUIRED_FIELD', 'name, email, password, and handle required');
    if (!/^[a-z0-9_-]+$/.test(handle)) return err('VALIDATION_INVALID_HANDLE', 'Handle can only contain letters, numbers, hyphens, and underscores');
    const existingEmail = await SKILL_STORE.get(`users/${email}`);
    if (existingEmail) return err('AUTH_EMAIL_EXISTS', 'Email already registered', 409);
    const existingHandle = await SKILL_STORE.get(`handles/${handle}`);
    if (existingHandle) return err('AUTH_HANDLE_TAKEN', 'Handle already taken', 409);
    const { hash: passwordHash, saltHex } = await hashPassword(password);
    const user = { id: crypto.randomUUID(), name, handle, email, createdAt: new Date().toISOString() };
    await SKILL_STORE.put(`users/${email}`, JSON.stringify({ ...user, passwordHash, saltHex }));
    await SKILL_STORE.put(`handles/${handle}`, email);
    const token = generateToken();
    await SKILL_STORE.put(`tokens/${token}`, email, { expirationTtl: 604800 });
    return ok({ user, token }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return err('AUTH_REGISTRATION_FAILED', 'Registration failed', 500);
  }
}

async function handleAuthLogin(request, SKILL_STORE) {
  try {
    const { email: rawEmail, password } = await request.json();
    const email = rawEmail?.toLowerCase().trim();
    if (!email || !password) return err('VALIDATION_REQUIRED_FIELD', 'email and password required');
    const record = await SKILL_STORE.get(`users/${email}`, { type: 'json' });
    if (!record) return err('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
    const saltBytes = record.saltHex ? hexToBytes(record.saltHex) : undefined;
    const { hash: hashed } = await hashPassword(password, saltBytes);
    if (hashed !== record.passwordHash) return err('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
    const token = generateToken();
    await SKILL_STORE.put(`tokens/${token}`, email, { expirationTtl: 604800 });
    const { passwordHash, saltHex, ...user } = record;
    return ok({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    return err('AUTH_LOGIN_FAILED', 'Login failed', 500);
  }
}

async function handleAuthMe(request, SKILL_STORE) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return err('AUTH_REQUIRED', 'Authorization header required', 401);
  const token = authHeader.slice(7);
  const record = await getUserFromToken(token, SKILL_STORE);
  if (!record) return err('AUTH_INVALID_TOKEN', 'Invalid or expired token', 401);
  const { passwordHash, saltHex, ...user } = record;
  return ok({ user });
}

async function createSkillBuilderSession(request, SKILL_STORE) {
  try {
    const body = await request.json().catch(() => ({}));
    let baseSpec = createEmptySkillSpec();

    if (body.skillId) {
      const skill = await SKILL_STORE.get(`skills/${parseSkillId(body.skillId)}`, { type: 'json' });
      if (!skill) return err('SKILL_NOT_FOUND', 'Skill not found', 404);
      baseSpec = normalizeSkillSpec(skill.spec, baseSpec);
    }

    const spec = normalizeSkillSpec(body.initialSpec, baseSpec);
    const now = new Date().toISOString();
    const session = {
      id: crypto.randomUUID(),
      skillId: body.skillId ? parseSkillId(body.skillId) : undefined,
      spec,
      artifacts: buildArtifacts(spec),
      messages: [],
      activity: [{
        id: `session-${Date.now()}`,
        label: 'Started skill-builder session',
        status: 'done',
        detail: body.intent ? asString(body.intent).slice(0, 180) : undefined,
      }],
      createdAt: now,
      updatedAt: now,
    };

    await SKILL_STORE.put(`sessions/${session.id}`, JSON.stringify(session), { expirationTtl: 86400 });
    return ok({ session }, 201);
  } catch (error) {
    console.error('Create session error:', error);
    return err('SKILL_BUILDER_SESSION_CREATE_FAILED', 'Could not create skill-builder session', 500);
  }
}

async function getSkillBuilderSession(rawSessionId, SKILL_STORE) {
  try {
    const sessionId = decodeURIComponent(rawSessionId);
    const session = await SKILL_STORE.get(`sessions/${sessionId}`, { type: 'json' });
    if (!session) return err('SKILL_BUILDER_SESSION_NOT_FOUND', 'Skill-builder session not found', 404);
    return ok({ session });
  } catch (error) {
    console.error('Get session error:', error);
    return err('SKILL_BUILDER_SESSION_FETCH_FAILED', 'Could not load skill-builder session', 500);
  }
}

async function handleSkillBuilderTurn(request, rawSessionId, SKILL_STORE, AI) {
  try {
    const sessionId = decodeURIComponent(rawSessionId);
    const session = await SKILL_STORE.get(`sessions/${sessionId}`, { type: 'json' });
    if (!session) return err('SKILL_BUILDER_SESSION_NOT_FOUND', 'Skill-builder session not found', 404);

    const body = await request.json();
    const intent = asString(body.intent);
    if (!intent) return err('SKILL_BUILDER_INVALID_INTENT', 'intent string required');

    const currentSpec = normalizeSkillSpec(body.currentSpec, session.spec);
    const runId = asString(body.clientMessageId) || `builder-${Date.now()}`;
    const userMessage = { role: 'user', text: intent, createdAt: new Date().toISOString() };

    const inferenceMessages = buildSkillArchitectMessages(intent, currentSpec, body.messages);
    const aiResponse = await runInference(AI, inferenceMessages, {
      temperature: 0.2,
      max_tokens: 4096,
    });

    const responseText = typeof aiResponse.response === 'string'
      ? aiResponse.response
      : aiResponse.response?.response || JSON.stringify(aiResponse.response ?? aiResponse);

    const parsed = parseBuilderModelOutput(responseText);
    let operations = parsed.operations;

    if (operations.length === 0 && parsed.spec) {
      operations = [{ type: 'replace_spec', value: parsed.spec, reason: 'Generated a complete SkillSpec from the user intent.' }];
    }

    if (operations.length === 0) {
      return err(
        'SKILL_BUILDER_INVALID_MODEL_OUTPUT',
        'Skill architect returned no valid operations',
        502,
        responseText.slice(0, 1000),
      );
    }

    const nextSpec = applySkillOperations(currentSpec, operations);
    const artifacts = buildArtifacts(nextSpec);
    const activity = parsed.activity.length > 0 ? parsed.activity : activityFromOperations(operations, runId);
    const assistantMessage = {
      role: 'assistant',
      text: parsed.assistantText || `Applied ${operations.length} state operation${operations.length === 1 ? '' : 's'} to the SkillSpec.`,
      createdAt: new Date().toISOString(),
    };

    const updatedSession = {
      ...session,
      skillId: body.selectedSkillId ? parseSkillId(body.selectedSkillId) : session.skillId,
      spec: nextSpec,
      artifacts,
      messages: [...(Array.isArray(session.messages) ? session.messages : []), userMessage, assistantMessage],
      activity: [...(Array.isArray(session.activity) ? session.activity : []), ...activity],
      updatedAt: new Date().toISOString(),
    };

    await SKILL_STORE.put(`sessions/${sessionId}`, JSON.stringify(updatedSession), { expirationTtl: 86400 });

    return ok({
      sessionId,
      operations,
      spec: nextSpec,
      artifacts,
      activity,
      message: assistantMessage,
    });
  } catch (error) {
    console.error('Skill-builder turn error:', error);
    return err('SKILL_BUILDER_TURN_FAILED', 'Skill-builder turn failed', 500);
  }
}

async function handleSkillExecute(request, rawSkillId, SKILL_STORE, AI) {
  try {
    const { input, taskOutline, spec } = await request.json();
    if (!input || typeof input !== 'string') {
      return err('SKILL_EXECUTION_INVALID_INPUT', 'input string required');
    }
    const skillId = parseSkillId(rawSkillId);
    const skill = await SKILL_STORE.get(`skills/${skillId}`, { type: 'json' });
    if (!skill) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }
    if (!skill.spec && !spec) {
      return err('SKILL_SPEC_REQUIRED', 'SkillSpec required to execute skill', 400);
    }

    const response = await executeSkill(AI, skill, input, taskOutline, spec);

    return ok({ response, trace: [{ id: `execute-${Date.now()}`, label: 'Executed skill from SkillSpec', status: 'done', detail: skill.name }] });
  } catch (error) {
    console.error('Skill execution error:', error);
    return err('SKILL_EXECUTION_FAILED', 'Skill execution failed', 500);
  }
}

async function listSkills(SKILL_STORE, url) {
  const searchParams = url.searchParams;
  const page = Math.max(1, parseInt(searchParams.get('page') || '') || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '') || 20));
  const query = searchParams.get('query')?.toLowerCase() || '';
  const category = searchParams.get('category')?.toLowerCase() || '';
  const tags = searchParams.getAll('tags');
  const sort = searchParams.get('sort') || 'recent';

  const allKeys = [];
  let cursor;
  do {
    const result = await SKILL_STORE.list({ prefix: 'skills/', cursor });
    allKeys.push(...result.keys);
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  let skills = await Promise.all(
    allKeys.map(async (item) => {
      const value = await SKILL_STORE.get(item.name, { type: 'json' });
      return value || null;
    }),
  );

  skills = skills.filter(Boolean);

  if (query) {
    skills = skills.filter((s) => {
      const searchable = [
        s.name,
        s.description,
        s.category,
        s.markdown,
        JSON.stringify(s.spec || {}),
        ...(s.tags || []),
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }

  if (category) {
    skills = skills.filter(s => s.category?.toLowerCase() === category || s.spec?.category?.toLowerCase() === category);
  }

  if (tags.length > 0) {
    const lowerTags = tags.map(t => t.toLowerCase());
    skills = skills.filter(s => lowerTags.some(t => s.tags?.some(st => st.toLowerCase() === t)));
  }

  const now = Date.now();
  switch (sort) {
    case 'popular':
      skills.sort((a, b) => {
        const daysA = (now - new Date(a.updatedAt).getTime()) / 86400000;
        const daysB = (now - new Date(b.updatedAt).getTime()) / 86400000;
        return (b.downloads * 100 - daysB) - (a.downloads * 100 - daysA);
      });
      break;
    case 'downloads':
      skills.sort((a, b) => b.downloads - a.downloads);
      break;
    case 'recent':
    default:
      skills.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  const total = skills.length;
  const start = (page - 1) * pageSize;
  const paginatedSkills = skills.slice(start, start + pageSize);

  return ok({ skills: paginatedSkills, total, page, pageSize });
}

async function requireAuth(request, SKILL_STORE) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: err('AUTH_REQUIRED', 'Authentication required', 401) };
  }
  const user = await getUserFromToken(authHeader.slice(7), SKILL_STORE);
  if (!user) {
    return { error: err('AUTH_INVALID_TOKEN', 'Invalid or expired token', 401) };
  }
  return { user };
}

async function saveSkill(request, SKILL_STORE) {
  try {
    const { user, error } = await requireAuth(request, SKILL_STORE);
    if (error) return error;

    const skill = await request.json();
    if (!skill?.id) return err('VALIDATION_REQUIRED_FIELD', 'Skill id required');
    if (!skill?.spec) return err('VALIDATION_REQUIRED_FIELD', 'SkillSpec required');

    const spec = normalizeSkillSpec(skill.spec);
    const validationErrors = validateSkillSpec(spec);
    if (validationErrors.length > 0) {
      return err('VALIDATION_SKILL_SPEC_INVALID', 'SkillSpec is invalid', 400, validationErrors);
    }

    const now = new Date().toISOString();
    const markdown = skill.markdown || specToMarkdown(spec);
    const skillWithMeta = {
      id: parseSkillId(skill.id),
      name: spec.name,
      description: spec.description,
      category: spec.category,
      tags: spec.tags,
      spec,
      markdown,
      author: { id: user.id, name: user.name, avatar: user.avatar },
      authorHandle: user.handle,
      forkedFrom: skill.forkedFrom,
      createdAt: skill.createdAt || now,
      updatedAt: now,
      version: skill.version || 1,
      downloads: skill.downloads || 0,
    };

    await SKILL_STORE.put(`skills/${skillWithMeta.id}`, JSON.stringify(skillWithMeta));

    return ok({ success: true, skill: skillWithMeta }, 201);
  } catch (error) {
    console.error('Save error:', error);
    return err('SKILL_SAVE_FAILED', 'Save failed', 500);
  }
}

async function updateSkill(request, rawSkillId, SKILL_STORE) {
  try {
    const { error } = await requireAuth(request, SKILL_STORE);
    if (error) return error;

    const skillId = parseSkillId(rawSkillId);
    const updates = await request.json();
    const existing = await SKILL_STORE.get(`skills/${skillId}`, { type: 'json' });
    if (!existing) return err('SKILL_NOT_FOUND', 'Skill not found', 404);

    const spec = normalizeSkillSpec(updates.spec || existing.spec);
    const validationErrors = validateSkillSpec(spec);
    if (validationErrors.length > 0) {
      return err('VALIDATION_SKILL_SPEC_INVALID', 'SkillSpec is invalid', 400, validationErrors);
    }

    const updated = {
      ...existing,
      ...updates,
      id: skillId,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      tags: spec.tags,
      spec,
      markdown: updates.markdown || specToMarkdown(spec),
      updatedAt: new Date().toISOString(),
      version: (existing.version || 1) + 1,
    };

    await SKILL_STORE.put(`skills/${skillId}`, JSON.stringify(updated));

    return ok({ skill: updated });
  } catch (error) {
    console.error('Update error:', error);
    return err('SKILL_UPDATE_FAILED', 'Update failed', 500);
  }
}

async function forkSkill(request, rawSkillId, SKILL_STORE) {
  try {
    const { user, error } = await requireAuth(request, SKILL_STORE);
    if (error) return error;

    const skillId = parseSkillId(rawSkillId);
    const original = await SKILL_STORE.get(`skills/${skillId}`, { type: 'json' });
    if (!original) return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    if (!original.spec) return err('SKILL_SPEC_REQUIRED', 'SkillSpec required to fork skill', 400);

    const body = await request.json().catch(() => ({}));
    const newId = body.id || `${original.id}-fork-${Date.now()}`;
    const conflict = await SKILL_STORE.get(`skills/${newId}`, { type: 'json' });
    if (conflict) return err('SKILL_ID_EXISTS', 'Skill with this ID already exists', 409);

    const spec = normalizeSkillSpec({
      ...original.spec,
      name: body.name || `${original.spec.name || original.name} (fork)`,
      description: body.description || original.spec.description || original.description,
    }, original.spec);

    const forked = {
      ...original,
      id: newId,
      name: spec.name,
      description: spec.description,
      category: spec.category,
      tags: spec.tags,
      spec,
      markdown: specToMarkdown(spec),
      forkedFrom: skillId,
      author: { id: user.id, name: user.name, avatar: user.avatar },
      authorHandle: user.handle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      downloads: 0,
    };

    await SKILL_STORE.put(`skills/${newId}`, JSON.stringify(forked));

    return ok({ success: true, skill: forked }, 201);
  } catch (error) {
    console.error('Fork error:', error);
    return err('SKILL_FORK_FAILED', 'Fork failed', 500);
  }
}

async function deleteSkill(request, rawSkillId, SKILL_STORE) {
  try {
    const { error } = await requireAuth(request, SKILL_STORE);
    if (error) return error;
    const skillId = parseSkillId(rawSkillId);
    const existing = await SKILL_STORE.get(`skills/${skillId}`, { type: 'json' });
    if (!existing) return err('SKILL_NOT_FOUND', 'Skill not found', 404);

    await SKILL_STORE.delete(`skills/${skillId}`);

    return ok({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return err('SKILL_DELETE_FAILED', 'Delete failed', 500);
  }
}

async function fetchSkill(rawId, SKILL_STORE) {
  try {
    const id = parseSkillId(rawId);
    const skill = await SKILL_STORE.get(`skills/${id}`, { type: 'json' });
    if (!skill) return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    return ok({ skill });
  } catch (error) {
    console.error('Fetch error:', error);
    return err('SKILL_FETCH_FAILED', 'Fetch failed', 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
