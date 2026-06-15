import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockSkill = {
  id: 'test-skill',
  name: 'Test Skill',
  description: 'A test skill',
  category: 'Utilities',
  tags: ['test'],
  spec: {
    name: 'Test Skill',
    description: 'A test skill',
    category: 'Utilities',
    tags: ['test'],
    purpose: '',
    instructions: [],
    promptTemplate: '',
    examples: [],
    tests: [],
  },
  markdown: '# Test\n\nTest content.',
  author: { id: 'user1', name: 'Test User' },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 1,
  downloads: 0,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('API client', () => {
  it('listSkills fetches from /api/skills', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { skills: [mockSkill], total: 1 } }),
    });

    const { listSkills } = await import('../services/api');
    const result = await listSkills();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/skills'),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].name).toBe('Test Skill');
  });

  it('listSkills passes search params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { skills: [], total: 0 } }),
    });

    const { listSkills } = await import('../services/api');
    await listSkills({ query: 'test', category: 'Data' });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('query=test');
    expect(calledUrl).toContain('category=Data');
  });

  it('saveSkill posts skill data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { skill: mockSkill } }),
    });

    const { saveSkill } = await import('../services/api');
    await saveSkill(mockSkill);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ id: 'test-skill', name: 'Test Skill' });
  });

  it('saveSkill includes auth headers when token exists', async () => {
    localStorage.setItem('auth_token', 'my-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { skill: mockSkill } }),
    });

    const { saveSkill } = await import('../services/api');
    await saveSkill(mockSkill);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-token');

    localStorage.removeItem('auth_token');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }),
    });

    const { listSkills } = await import('../services/api');
    await expect(listSkills()).rejects.toThrow('Not found');
  });

  it('forkSkill forks a skill', async () => {
    const forked = { ...mockSkill, id: 'test-skill-fork', name: 'Test Skill (fork)' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: { skill: forked } }),
    });

    const { forkSkill } = await import('../services/api');
    const result = await forkSkill('test-skill');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/skills/test-skill/fork'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.skill.id).toBe('test-skill-fork');
  });

  it('generateNpxCommand returns correct command', async () => {
    const { generateNpxCommand } = await import('../services/api');
    const cmd = generateNpxCommand({ id: 'my-skill', authorHandle: undefined });
    expect(cmd).toBe('npx @concordex-ai/skill-builder install my-skill');
  });

  it('generateNpxCommand includes @handle prefix', async () => {
    const { generateNpxCommand } = await import('../services/api');
    const cmd = generateNpxCommand({ id: 'my-skill', authorHandle: 'skillauthor' });
    expect(cmd).toBe('npx @concordex-ai/skill-builder install @skillauthor/my-skill');
  });

  it('generateNpxCommand uses scoped id as-is', async () => {
    const { generateNpxCommand } = await import('../services/api');
    const cmd = generateNpxCommand({ id: '@skillauthor/my-skill', authorHandle: 'skillauthor' });
    expect(cmd).toBe('npx @concordex-ai/skill-builder install @skillauthor/my-skill');
  });
});
