import * as fs from 'fs';
import * as path from 'path';
import { createApiClient, type Skill, type SkillSpec, type SkillType } from './api/client.js';
import { slugify, validateSpec, qualifyDependencies } from './sync.js';
import { anthropicInventSpec, DEFAULT_MODEL, DEFAULT_EFFORT } from './anthropic.js';

/**
 * The "imagination" half of the claw.
 *
 * Invents brand-new skills from a seeded prompt, de-duplicates them against what
 * already exists, then writes each as a `.json` manifest and/or publishes it.
 *
 * Two generation backends:
 * - 'anthropic' (default): Claude Opus 4.8 at high reasoning effort via your
 *   ANTHROPIC_API_KEY. Highest quality.
 * - 'registry': the Worker's built-in Skill Architect (Cloudflare Workers AI),
 *   no external key required.
 *
 * Designed to run unattended on a schedule.
 */

export type GenerateBackend = 'anthropic' | 'registry';

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
  /**
   * Probability (0..1) that a given skill is invented as a *meta* skill that
   * bundles existing skills as dependencies. Falls back to a basic skill when
   * fewer than two skills exist to depend on.
   */
  metaRatio?: number;
  /** Which LLM invents the skills. Defaults to 'anthropic' (Opus 4.8). */
  backend?: GenerateBackend;
  /** Required when backend is 'anthropic'. */
  anthropicApiKey?: string;
  /** Anthropic model id (default claude-opus-4-8). */
  model?: string;
  /** Anthropic reasoning effort: low | medium | high | xhigh | max (default high). */
  effort?: string;
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

/** Pick `n` distinct random items from an array (or fewer if the array is small). */
function sampleN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length > 0 && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

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

/**
 * Intent for inventing a *meta* skill that orchestrates real, existing skills.
 * The dependency ids themselves are set programmatically afterward (we never
 * trust the model to copy ids verbatim) — this prompt just shapes the name,
 * description, purpose, and the instructions that sequence the bundled skills.
 */
export function buildMetaIntent(theme: string, deps: { id: string; name: string }[]): string {
  const list = deps.map((d) => `- ${d.name} (${d.id})`).join('\n');
  return [
    `Invent ONE original META-skill: a higher-level workflow in the domain of ${theme} that orchestrates these existing skills as building blocks:`,
    `\n${list}\n`,
    'Give it a distinctive name and a description that makes the end-to-end workflow clear.',
    'Write a purpose and 4-8 instructions that explain, in order, how it uses each of the skills above to deliver a larger outcome.',
    'Provide a prompt template using {{input}}, at least one example, and at least one test.',
    'This is a meta-skill, so its value is in the orchestration, not in duplicating what the dependencies already do.',
  ].join(' ').replace(' \n', '\n');
}

const EMPTY_SPEC: SkillSpec = {
  name: '', description: '', category: 'Utilities', tags: [],
  purpose: '', instructions: [], promptTemplate: '', examples: [], tests: [],
  type: 'basic', dependencies: [],
};

function specToMarkdown(spec: SkillSpec): string {
  const deps = spec.dependencies ?? [];
  const lines = [
    `# ${spec.name || 'Untitled Skill'}`, '',
    '## Purpose', spec.purpose || spec.description || '', '',
    ...(deps.length
      ? ['## Dependencies', 'Installing this skill also installs:', ...deps.map((d) => `- \`${d}\``), '']
      : []),
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

  const backend: GenerateBackend = options.backend || 'anthropic';
  const model = options.model || DEFAULT_MODEL;
  const effort = options.effort || DEFAULT_EFFORT;
  if (backend === 'anthropic' && !options.anthropicApiKey) {
    throw new Error('Anthropic backend requires an API key. Set ANTHROPIC_API_KEY or use --backend registry.');
  }
  log(backend === 'anthropic' ? `Generation backend: Anthropic ${model} (effort ${effort}).` : 'Generation backend: registry Skill Architect.');

  // Invent one raw spec (+ optional markdown artifact) from an intent.
  const inventSpec = async (intent: string, iteration: number): Promise<{ raw: Partial<SkillSpec>; markdown: string }> => {
    if (backend === 'registry') {
      const session = await client.createSkillBuilderSession({ intent });
      const turn = await client.skillBuilderTurn(session.session.id, {
        intent,
        currentSpec: session.session.spec || EMPTY_SPEC,
        clientMessageId: `gen-${Date.now()}-${iteration}`,
      });
      return { raw: turn.spec || {}, markdown: (turn.artifacts && turn.artifacts.markdown) || '' };
    }
    const raw = await anthropicInventSpec({ apiKey: options.anthropicApiKey!, model, effort }, intent);
    return { raw, markdown: '' };
  };

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
  const existingSkills: { id: string; name: string }[] = [];
  const takenIds = new Set<string>();
  try {
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const list = await client.listSkills({ page, pageSize: 100 });
      for (const s of list.skills as Skill[]) {
        existingNames.push(s.name);
        existingSkills.push({ id: s.id, name: s.name });
        takenIds.add(bareIdOf(s.id));
      }
      if (list.skills.length === 0 || existingNames.length >= list.total || page > 100) break;
      page += 1;
    }
  } catch (error) {
    log(`Warning: could not read existing skills for de-duplication (${error instanceof Error ? error.message : String(error)}).`);
  }
  const metaRatio = Math.max(0, Math.min(1, options.metaRatio ?? 0));
  const canMeta = existingSkills.length >= 2;
  log(`Registry has ${existingNames.length} existing skill(s); inventing ${options.count} new one(s)${metaRatio > 0 && canMeta ? ` (meta ratio ${metaRatio})` : ''}.`);

  // Also avoid colliding with manifests already sitting in the output folder.
  if (options.outDir && fs.existsSync(options.outDir)) {
    for (const f of fs.readdirSync(options.outDir)) {
      if (f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.')) takenIds.add(path.basename(f, '.json'));
    }
  }

  for (let i = 0; i < options.count; i++) {
    const theme = options.theme || pick(THEMES);
    const angle = pick(ANGLES);

    // Decide whether this one is a meta skill, and pick real dependencies if so.
    const wantMeta = canMeta && Math.random() < metaRatio;
    const chosenDeps = wantMeta ? sampleN(existingSkills, 2 + Math.floor(Math.random() * 3)) : [];
    const intent = wantMeta
      ? buildMetaIntent(theme, chosenDeps)
      : buildInventionIntent(theme, angle, existingNames.slice(-40));

    try {
      const invented = await inventSpec(intent, i);

      const spec: SkillSpec = { ...EMPTY_SPEC, ...invented.raw };

      // Set dependencies/type ourselves — never trust the model to echo real ids.
      // Meta skills get the concrete ids we chose; basic skills get none (so a
      // hallucinated dependency can never produce a broken, unresolvable skill).
      if (wantMeta && chosenDeps.length >= 1) {
        spec.dependencies = qualifyDependencies(chosenDeps.map((d) => d.id), handle || '');
        spec.type = 'meta';
      } else {
        spec.dependencies = [];
        spec.type = 'basic';
      }
      const skillType: SkillType = spec.type;

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

      // For meta skills, regenerate markdown so the dependency list is correct
      // (the model's artifact won't carry the ids we set programmatically).
      const markdown = (skillType === 'meta' || !invented.markdown)
        ? specToMarkdown(spec)
        : invented.markdown;
      const manifest = {
        id: bareId,
        name,
        description: spec.description,
        category: spec.category,
        tags: spec.tags,
        type: skillType,
        dependencies: spec.dependencies ?? [],
        spec,
        markdown,
      };

      const metaNote = skillType === 'meta' ? ` (meta → ${(spec.dependencies ?? []).join(', ')})` : '';
      log(`  ✨ invented "${name}" [${spec.category}] (id: ${bareId})${metaNote} — theme: ${theme}`);

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
