const jsonHeaders = {
  'Content-Type': 'application/json;charset=UTF-8',
};

function ok(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: jsonHeaders });
}

function err(code, message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: jsonHeaders });
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

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
  if (raw.startsWith('@')) return raw.slice(raw.indexOf('/') + 1);
  return raw;
}

async function getUserFromToken(token, SKILL_STORE) {
  if (!token) return null;
  const userId = await SKILL_STORE.get(`tokens/${token}`);
  if (!userId) return null;
  return SKILL_STORE.get(`users/${userId}`, { type: 'json' });
}

async function runInference(ai, messages, options = {}) {
  const response = await ai.run(MODEL, {
    messages,
    ...options,
  });
  return response;
}

function buildSkillExecutionPrompt(skill, userInput, taskOutline) {
  return `Execute the following skill with the given input.

Skill: ${skill.name}
Category: ${skill.category}
Tags: ${skill.tags?.join(', ') || 'none'}

Skill Markdown:
${skill.markdown}

Task Context: ${taskOutline || 'No specific task outline provided.'}

User Input: ${userInput}

Execute this skill by following its markdown instructions precisely.`;
}

async function executeSkill(ai, skill, userInput, taskOutline) {
  const prompt = buildSkillExecutionPrompt(skill, userInput, taskOutline);
  
  const messages = [
    { role: 'system', content: "You are executing a specific skill. Follow the skill's markdown instructions precisely." },
    { role: 'user', content: prompt },
  ];

  const response = await runInference(ai, messages, {
    temperature: 0.5,
    max_tokens: 2048,
  });

  return typeof response.response === 'string' ? response.response : response.response?.response || '';
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/api\//, '');
  const { SKILL_STORE, AI } = env;

  if (url.pathname === '/api/skills' && request.method === 'GET') {
    return listSkills(SKILL_STORE, url);
  }

  if (url.pathname === '/api/skills' && request.method === 'POST') {
    return saveSkill(request, SKILL_STORE);
  }

  if (request.method === 'GET' && key.startsWith('skills/')) {
    return fetchSkill(key.replace(/^skills\//, ''), SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/fork') && request.method === 'POST') {
    const skillId = url.pathname.replace('/api/skills/', '').replace('/fork', '');
    return forkSkill(request, skillId, SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && request.method === 'PATCH' && !url.pathname.slice(12).includes('/')) {
    const skillId = url.pathname.replace('/api/skills/', '');
    return updateSkill(request, skillId, SKILL_STORE);
  }

  if (url.pathname.startsWith('/api/skills/') && request.method === 'DELETE' && !url.pathname.slice(12).includes('/')) {
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

  if (url.pathname === '/api/agent/chat' && request.method === 'POST') {
    return handleAgentChat(request, SKILL_STORE, AI);
  }

  if (url.pathname.startsWith('/api/skills/') && url.pathname.endsWith('/execute') && request.method === 'POST') {
    const skillId = url.pathname.replace('/api/skills/', '').replace('/execute', '');
    return handleSkillExecute(request, skillId, SKILL_STORE, AI);
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
    const { passwordHash, ...user } = record;
    return ok({ user, token });
  } catch (error) {
    return err('AUTH_LOGIN_FAILED', 'Login failed', 500);
  }
}

async function handleAuthMe(request, SKILL_STORE) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return err('AUTH_REQUIRED', 'Authorization header required', 401);
  const token = authHeader.slice(7);
  const record = await getUserFromToken(token, SKILL_STORE);
  if (!record) return err('AUTH_INVALID_TOKEN', 'Invalid or expired token', 401);
  const { passwordHash, ...user } = record;
  return ok({ user });
}

async function handleAgentChat(request, SKILL_STORE, AI) {
  try {
    const { messages, skillId, taskOutline } = await request.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return err('AGENT_CHAT_INVALID_MESSAGES', 'messages array required');
    }
    
    let skill = null;
    if (skillId) {
      const skillData = await SKILL_STORE.get(`skills/${parseSkillId(skillId)}`, { type: 'json' });
      if (skillData) skill = skillData;
    }

    const defaultPrompt = 'You are an AI assistant that helps users write and refine skill markdown documents. Help the user design their skill.';
    const systemPrompt = skill 
      ? `You are an AI assistant that helps write and refine skill markdown documents. The user is working on skill "${skill.name}". Its current content:

\`\`\`markdown
${skill.markdown}
\`\`\`

When the user asks you to write or update the skill, respond with a complete markdown document inside a triple-backtick markdown code block. The skill markdown should follow this structure:
- # Skill Name
- ## Purpose
- ## Instructions (numbered steps)
- ## Prompt Template (code block with placeholders like {{variable}})
- ## Examples (numbered with input/output)

Keep the response concise and include only the full markdown block when providing the skill content. If the user asks for changes, explain briefly then output the updated markdown.`
      : defaultPrompt;

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.text })),
    ];

    const response = await runInference(AI, formattedMessages, {
      temperature: 0.7,
      max_tokens: 1024,
    });

    return ok({ response: response.response ?? response });
  } catch (error) {
    console.error('Agent chat error:', error);
    return err('AGENT_CHAT_FAILED', 'Agent chat failed', 500);
  }
}

async function handleSkillExecute(request, rawSkillId, SKILL_STORE, AI) {
  try {
    const { input, taskOutline } = await request.json();
    if (!input || typeof input !== 'string') {
      return err('SKILL_EXECUTION_INVALID_INPUT', 'input string required');
    }
    const skillId = parseSkillId(rawSkillId);
    const skill = await SKILL_STORE.get(`skills/${skillId}`, { type: 'json' });
    if (!skill) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }

    const response = await executeSkill(AI, skill, input, taskOutline);

    return ok({ response });
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
    skills = skills.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.markdown.toLowerCase().includes(query) ||
      s.tags?.some(t => t.toLowerCase().includes(query))
    );
  }

  if (category) {
    skills = skills.filter(s => s.category.toLowerCase() === category);
  }

  if (tags.length > 0) {
    const lowerTags = tags.map(t => t.toLowerCase());
    skills = skills.filter(s => lowerTags.some(t => s.tags?.some(st => st.toLowerCase() === t)));
  }

  const now = Date.now();
  switch (sort) {
    // popular: each download adds 100 points, each day since update subtracts 1 point.
    // A skill with 10 downloads updated today scores ~1000.
    // A skill with 5 downloads updated 30 days ago scores ~470.
    // Downloads dominate recency by roughly 3:1 over a 300-day window.
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
    if (!skill?.id) {
      return err('VALIDATION_REQUIRED_FIELD', 'Skill id required');
    }
    if (!skill?.markdown) {
      return err('VALIDATION_REQUIRED_FIELD', 'Skill markdown required');
    }

    const now = new Date().toISOString();
    const skillWithMeta = {
      ...skill,
      authorHandle: user.handle,
      createdAt: skill.createdAt || now,
      updatedAt: now,
      version: skill.version || 1,
      downloads: skill.downloads || 0,
      tags: skill.tags || [],
    };

    await SKILL_STORE.put(`skills/${skill.id}`, JSON.stringify(skillWithMeta));

    return ok({ skill: skillWithMeta }, 201);
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
    if (!existing) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id: skillId,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
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
    if (!original) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }

    const body = await request.json().catch(() => ({}));
    const newId = body.id || `${original.id}-fork-${Date.now()}`;
    const conflict = await SKILL_STORE.get(`skills/${newId}`, { type: 'json' });
    if (conflict) {
      return err('SKILL_ID_EXISTS', 'Skill with this ID already exists', 409);
    }
    const newName = body.name || `${original.name} (fork)`;

    const originalAuthorTag = original.authorHandle
      ? `@${original.authorHandle}/${original.id}`
      : `\`${original.id}\``;
    const markdownWithAttribution = `${original.markdown}\n\n---\n*Forked from ${originalAuthorTag} — original by ${original.author?.name || 'Unknown'}*`;
    const forked = {
      ...original,
      id: newId,
      name: newName,
      description: body.description || original.description,
      markdown: markdownWithAttribution,
      forkedFrom: skillId,
      author: body.author || { id: user.id, name: user.name },
      authorHandle: user.handle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      downloads: 0,
    };

    await SKILL_STORE.put(`skills/${newId}`, JSON.stringify(forked));

    return ok({ skill: forked }, 201);
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
    if (!existing) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }

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
    if (!skill) {
      return err('SKILL_NOT_FOUND', 'Skill not found', 404);
    }

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