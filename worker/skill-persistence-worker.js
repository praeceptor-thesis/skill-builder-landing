addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

const jsonHeaders = {
  'Content-Type': 'application/json;charset=UTF-8',
};

async function handleRequest(request) {
  const url = new URL(request.url);
  const key = url.pathname.replace(/^\/api\//, '');

  if (url.pathname === '/api/skills' && request.method === 'GET') {
    return listSkills();
  }

  if (url.pathname === '/api/skills' && request.method === 'POST') {
    return saveSkill(request);
  }

  if (request.method === 'GET' && key.startsWith('skills/')) {
    return fetchSkill(key.replace(/^skills\//, ''));
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: jsonHeaders,
  });
}

async function listSkills() {
  const list = await SKILL_STORE.list({ prefix: '' });
  const skills = await Promise.all(
    list.keys.map(async (item) => {
      const value = await SKILL_STORE.get(item.name, { type: 'json' });
      return value || null;
    }),
  );

  return new Response(JSON.stringify({ skills: skills.filter(Boolean) }), {
    status: 200,
    headers: jsonHeaders,
  });
}

async function saveSkill(request) {
  const skill = await request.json();
  if (!skill?.id) {
    return new Response(JSON.stringify({ error: 'Skill id required' }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  await SKILL_STORE.put(`skills/${skill.id}`, JSON.stringify(skill));

  return new Response(JSON.stringify({ success: true, skill }), {
    status: 201,
    headers: jsonHeaders,
  });
}

async function fetchSkill(id) {
  const skill = await SKILL_STORE.get(`skills/${id}`, { type: 'json' });
  if (!skill) {
    return new Response(JSON.stringify({ error: 'Skill not found' }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  return new Response(JSON.stringify({ skill }), {
    status: 200,
    headers: jsonHeaders,
  });
}
