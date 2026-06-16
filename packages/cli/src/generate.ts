import * as fs from 'fs';
import * as path from 'path';
import { createApiClient, type Skill, type SkillSpec } from './api/client.js';
import { slugify, validateSpec } from './sync.js';

/**
 * The "imagination" half of the claw.
 *
 * Uses the registry's own Skill Architect agent (POST /skill-builder/session
 * then a turn) to invent brand-new skills from a seeded prompt, de-duplicates
 * them against what already exists, then writes each as a `.json` manifest
 * and/or publishes it. No external LLM key required — it rides on the Worker's
 * Cloudflare Workers AI binding. Designed to run unattended on a schedule.
 */

// Seed domains that steer the architect toward variety. One is chosen per skill.
export const THEMES: string[] = [
  'personal finance and budgeting',
  'Kubernetes and cloud incident response',
  'cooking, recipes, and meal planning',
  'K-12 and adult tutoring',
  'legal contract and clause review',
  'podcast and video show notes',
  'API and changelog documentation',
  'user research and interview synthesis',
  'SQL and data analysis explanation',
  'sales outreach and personalization',
  'web accessibility auditing',
  'meeting facilitation and notes',
  'regular expressions and text processing',
  'git workflows and commit hygiene',
  'security threat modeling',
  'grant and proposal writing',
  'goal setting, OKRs, and planning',
  'customer churn and retention analysis',
  'travel planning and itineraries',
  'resume and cover letter coaching',
  'scientific paper summarization',
  'product naming and positioning',
  'mental models and decision making',
  'language learning and translation',
  'fitness and training programs',
  'home maintenance and repair guidance',
  'creative writing and worldbuilding',
  'data cleaning and validation',
  'customer support macros and replies',
  'social media content repurposing',
];

// Angles that add a twist so repeated runs on the same theme still differ.
export const ANGLES: string[] = [
  'aimed at complete beginners',
  'optimized for speed and brevity',
  'for an expert who wants depth and edge cases',
  'that produces a structured, copy-pasteable output',
  'that asks clarifying questions first when input is ambiguous',
  'focused on catching common mistakes',
  'that adapts tone to the audience',
  'with a step-by-step checklist format',
  'that includes a worked example in its output',
  'designed to be safe and to flag risky situations',
];

export type GenerateOptions = {
  registry: string;
  token?: string;
  count: number;
  theme?: string;
  outDir?: string;
  publish: boolean;
  dryRun?: boolean;
  log?: (msg: string) => void;
};

export type GenerateOutcome = 'published' | 'saved' | 'dry-run' | 'duplicate' | 'invalid' | 'failed';

export type GenerateItem = {
  id: string;
  name: string;
  category: string;
  outcome: GenerateOutcome;
  detail?: string;
};

export type GenerateResult = {
  handle?: string;
  items: GenerateItem[];
  published: number;
  saved: number;
  duplicate: number;
  invalid: number;
  failed: number;
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Strip a leading `@handle/` so we can compare against locally-derived ids. */
function bareIdOf(scopedId: string): string {
  return scopedId.startsWith('@') ? scopedId.slice(scopedId.indexOf('/') + 1) : scopedId;
}

export function buildInventionIntent(theme: string, angle: string, avoidNames: string[]): string {
  const avoid = avoidNames.length
    ? `\n\nThese skills already exist — invent something clearly different and do NOT reuse these names:\n${avoidNames.map((n) => `- ${n}`).join('\n')}`
    : '';
  return [
    `Invent ONE original, genuinely useful AI skill in the domain of ${theme}, ${angle}.`,
    'Pick a specific, concrete task within that domain rather than a broad catch-all.',
    'Give it a distinctive, descriptive name (not generic like "Helper" or "Assistant").',
    'Fully specify it: a clear description, a fitting category, 3-6 relevant tags, a concrete purpose,',
    '4-8 actionable instructions, a production-ready prompt template using {{input}} (and other obvious',
    'placeholders), at least two examples with input and output, and at least one test with name, input, and expected.',
    avoid,
  ].join(' ').replace(' \n', '\n');
}

const EMPTY_SPEC: SkillSpec = {
  name: '', description: '', category: 'Utilities', tags: [],
  purpose: '', instructions: [], promptTemplate: '', examples: [], tests: [],
};

function specToMarkdown(spec: SkillSpec): string {
  const lines = [
    `# ${spec.name || 'Untitled Skill'}`, '',
    '## Purpose', spec.purpose || spec.description || '', '',
    '## Instructions',
    ...(spec.instructions.length ? spec.instructions.map((s, i) => `${i + 1}. ${s}`) : ['1. Define behaviour.']),
    '', '## Prompt Template', '```', spec.promptTemplate || 'Use {{input}}.', '```',
  ];
  return lines.join('\n').trim() + '\n';
}

export async function runGenerate(options: GenerateOptions): Promise<GenerateResult> {
  const log = options.log || (() => {});
  const client = createApiClient(options.registry);
  if (options.token) client.setToken(options.token);

  const result: GenerateResult = { items: [], published: 0, saved: 0, duplicate: 0, invalid: 0, failed: 0 };

  // Resolve identity (only needed for publishing) and snapshot existing skills.
  let handle: string | undefined;
  if (options.publish && !options.dryRun) {
    if (!options.token) throw new Error('Publishing requires a token. Pass --token or set SKILL_TOKEN.');
    try {
      const me = await client.getCurrentUser();
      handle = me.user.handle;
      result.handle = handle;
      log(`Authenticated as @${handle}.`);
    } catch (error) {
      throw new Error(`Could not authenticate with ${options.registry}. Check SKILL_TOKEN. (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const existingNames: string[] = [];
  const takenIds = new Set<string>();
  try {
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const list = await client.listSkills({ page, pageSize: 100 });
      for (const s of list.skills as Skill[]) {
        existingNames.push(s.name);
        takenIds.add(bareIdOf(s.id));
      }
      if (list.skills.length === 0 || existingNames.length >= list.total || page > 100) break;
      page += 1;
    }
  } catch (error) {
    log(`Warning: could not read existing skills for de-duplication (${error instanceof Error ? error.message : String(error)}).`);
  }
  log(`Registry has ${existingNames.length} existing skill(s); inventing ${options.count} new one(s).`);

  // Also avoid colliding with manifests already sitting in the output folder.
  if (options.outDir && fs.existsSync(options.outDir)) {
    for (const f of fs.readdirSync(options.outDir)) {
      if (f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.')) takenIds.add(path.basename(f, '.json'));
    }
  }

  for (let i = 0; i < options.count; i++) {
    const theme = options.theme || pick(THEMES);
    const angle = pick(ANGLES);
    const avoid = existingNames.slice(-40);
    const intent = buildInventionIntent(theme, angle, avoid);

    try {
      const session = await client.createSkillBuilderSession({ intent });
      const turn = await client.skillBuilderTurn(session.session.id, {
        intent,
        currentSpec: session.session.spec || EMPTY_SPEC,
        clientMessageId: `gen-${Date.now()}-${i}`,
      });

      const spec: SkillSpec = { ...EMPTY_SPEC, ...turn.spec };
      const name = (spec.name || '').trim();

      // De-duplicate the id (and avoid empty/colliding ids).
      let bareId = slugify(name);
      if (bareId && (takenIds.has(bareId))) {
        let n = 2;
        while (takenIds.has(`${bareId}-${n}`) && n < 50) n += 1;
        bareId = `${bareId}-${n}`;
      }

      const errors = validateSpec(spec, bareId);
      const nameClash = name && existingNames.some((e) => e.toLowerCase() === name.toLowerCase());
      if (errors.length > 0) {
        result.items.push({ id: bareId || '?', name, category: spec.category, outcome: 'invalid', detail: errors.join('; ') });
        log(`  ✗ invalid: ${name || '(no name)'} — ${errors.join('; ')}`);
        continue;
      }
      if (nameClash) {
        result.items.push({ id: bareId, name, category: spec.category, outcome: 'duplicate', detail: 'name already exists' });
        log(`  • duplicate: "${name}" already exists, skipping`);
        continue;
      }

      takenIds.add(bareId);
      existingNames.push(name);

      const markdown = (turn.artifacts && turn.artifacts.markdown) ? turn.artifacts.markdown : specToMarkdown(spec);
      const manifest = {
        id: bareId,
        name,
        description: spec.description,
        category: spec.category,
        tags: spec.tags,
        spec,
        markdown,
      };

      log(`  ✨ invented "${name}" [${spec.category}] (id: ${bareId}) — theme: ${theme}`);

      if (options.dryRun) {
        result.items.push({ id: bareId, name, category: spec.category, outcome: 'dry-run' });
        continue;
      }

      if (options.outDir) {
        fs.mkdirSync(options.outDir, { recursive: true });
        const file = path.join(options.outDir, `${bareId}.json`);
        fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
        log(`     ↳ wrote ${file}`);
      }

      if (options.publish) {
        const response = await client.saveSkill({ ...manifest, version: 1 });
        result.published += 1;
        result.items.push({ id: response.skill.id, name, category: spec.category, outcome: 'published' });
        log(`     ↳ published ${response.skill.id}`);
      } else {
        result.saved += 1;
        result.items.push({ id: bareId, name, category: spec.category, outcome: 'saved' });
      }
    } catch (error) {
      result.failed += 1;
      result.items.push({ id: '?', name: '', category: '', outcome: 'failed', detail: error instanceof Error ? error.message : String(error) });
      log(`  ✗ generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.duplicate = result.items.filter((r) => r.outcome === 'duplicate').length;
  result.invalid = result.items.filter((r) => r.outcome === 'invalid').length;
  return result;
}
