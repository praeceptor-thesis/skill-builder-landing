export type SkillPayload = {
  id: string;
  name: string;
  description: string;
  category: string;
  persona: string;
};

const apiBase = (import.meta.env.VITE_SKILL_API_URL as string | undefined) || 'https://skills.eastern-shore-solutions.com/api';

export async function listSkills() {
  const response = await fetch(`${apiBase}/skills`);
  if (!response.ok) throw new Error('Failed to load skills');
  return response.json();
}

export async function saveSkill(skill: SkillPayload) {
  const response = await fetch(`${apiBase}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  if (!response.ok) throw new Error('Failed to save skill');
  return response.json();
}
