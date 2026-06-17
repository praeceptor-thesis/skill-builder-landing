import type { SkillSpec } from './api/client.js';

/**
 * Anthropic-backed skill invention.
 *
 * Calls the Messages API with Claude Opus 4.8 at high reasoning effort
 * (`output_config.effort`) and a `submit_skill` tool that pins the output to a
 * SkillSpec shape. Extended thinking only permits `tool_choice: auto`/`none`,
 * so the tool is offered (not forced) and we fall back to parsing JSON from the
 * text if the model answers in prose. No SDK dependency — plain fetch.
 *
 * Ref: https://platform.claude.com/docs/en/build-with-claude/effort
 */

export const DEFAULT_MODEL = 'claude-opus-4-8';
export const DEFAULT_EFFORT = 'high'; // low | medium | high | xhigh | max

const CATEGORIES = [
  'Conversational', 'Data', 'Automation', 'Utilities', 'Healthcare', 'Compliance',
  'Developer Tools', 'Productivity', 'Research', 'Sales', 'Support', 'Education',
  'Finance', 'Legal', 'Security',
];

const SUBMIT_SKILL_TOOL = {
  name: 'submit_skill',
  description: 'Submit the complete, production-ready skill you invented. Call this exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Distinctive, descriptive skill name.' },
      description: { type: 'string', description: 'One sentence: what it does and when to use it.' },
      category: { type: 'string', enum: CATEGORIES },
      tags: { type: 'array', items: { type: 'string' }, description: '3-6 lowercase tags.' },
      purpose: { type: 'string', description: 'The concrete outcome the skill achieves.' },
      instructions: { type: 'array', items: { type: 'string' }, description: '4-8 actionable steps.' },
      promptTemplate: { type: 'string', description: 'Production-ready template using {{input}} and other obvious placeholders.' },
      examples: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' } },
          required: ['input', 'output'],
        },
      },
      tests: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, input: { type: 'string' }, expected: { type: 'string' } },
          required: ['name', 'input', 'expected'],
        },
      },
    },
    required: ['name', 'description', 'category', 'purpose', 'instructions', 'promptTemplate'],
  },
};

export const ARCHITECT_SYSTEM = [
  'You are Skill Architect, an expert at inventing reusable, production-ready AI skills.',
  'Invent genuinely useful, specific skills — never generic "assistant" wrappers.',
  'Always respond by calling the submit_skill tool exactly once with a complete spec:',
  'a clear description, fitting category, relevant tags, a concrete purpose, 4-8 actionable',
  'instructions, a prompt template using {{input}}, at least two examples, and at least one test.',
].join(' ');

export type AnthropicConfig = {
  apiKey: string;
  model?: string;
  effort?: string;
  maxTokens?: number;
  baseUrl?: string;
};

/** Extract the first balanced JSON object from a string (fallback parser). */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Invent one skill spec via Anthropic. Returns the raw (partial) SkillSpec the model produced. */
export async function anthropicInventSpec(
  cfg: AnthropicConfig,
  intent: string,
): Promise<Partial<SkillSpec>> {
  const url = `${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: cfg.maxTokens || 16000,
      output_config: { effort: cfg.effort || DEFAULT_EFFORT },
      system: ARCHITECT_SYSTEM,
      tools: [SUBMIT_SKILL_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: intent }],
    }),
  });

  const data = await res.json().catch(() => null) as
    | { content?: Array<Record<string, unknown>>; type?: string; error?: { message?: string } }
    | null;

  if (!res.ok || !data || data.type === 'error') {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Anthropic request failed: ${msg}`);
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  const tool = blocks.find((b) => b.type === 'tool_use' && b.name === 'submit_skill');
  if (tool && tool.input && typeof tool.input === 'object') {
    return tool.input as Partial<SkillSpec>;
  }

  const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text || '')).join('\n');
  const parsed = extractJsonObject(text);
  if (parsed) return parsed as Partial<SkillSpec>;

  throw new Error('Anthropic response contained no submit_skill tool call or parseable JSON.');
}
