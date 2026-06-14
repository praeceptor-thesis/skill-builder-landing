export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  markdown: string;
  author: { id: string; name: string; avatar?: string };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
}

export type SkillPayload = Omit<Skill, 'createdAt' | 'updatedAt' | 'downloads' | 'version'>;

export interface SkillListResponse {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SkillResponse {
  skill: Skill;
}

export type SaveSkillResponse = { success: boolean; skill: Skill };
export type ForkSkillResponse = { success: boolean; skill: Skill };

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface ChatRequest {
  messages: AgentMessage[];
  skillId?: string;
  taskOutline?: string;
}

export interface ChatResponse {
  response: string;
}

export interface ExecuteSkillRequest {
  input: string;
  taskOutline?: string;
}

export interface ExecuteSkillResponse {
  response: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegistrySearchParams {
  query?: string;
  category?: string;
  tags?: string[];
  author?: string;
  sort?: 'recent' | 'popular' | 'downloads';
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export type SkillCategory = 'Conversational' | 'Data' | 'Automation' | 'Utilities';

export const SKILL_CATEGORIES: SkillCategory[] = [
  'Conversational', 'Data', 'Automation', 'Utilities',
];

export function isSkillCategory(value: string): value is SkillCategory {
  return SKILL_CATEGORIES.includes(value as SkillCategory);
}

export function validateSkill(skill: Partial<Skill>): string[] {
  const errors: string[] = [];
  if (!skill.id?.trim()) errors.push('Skill ID is required');
  if (!skill.name?.trim()) errors.push('Skill name is required');
  if (!skill.description?.trim()) errors.push('Description is required');
  if (!skill.category?.trim()) errors.push('Category is required');
  if (!skill.markdown?.trim()) errors.push('Skill markdown is required');
  if (skill.category && !isSkillCategory(skill.category)) {
    errors.push(`Invalid category: ${skill.category}`);
  }
  return errors;
}
