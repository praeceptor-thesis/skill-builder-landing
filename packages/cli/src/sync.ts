import * as fs from 'fs';
import * as path from 'path';
import { createApiClient, type Skill, type SkillPayload, type SkillSpec, type SkillType } from './api/client.js';

/**
 * "Sync" engine for the skill-builder registry.
 *
 * Scans a local folder for skill source files (`.md` / `.json`), turns each into
 * a registry-valid payload (the deployed Worker requires a full SkillSpec), then
 * publishes the ones that are new or changed relative to what is already live.
 *
 * Designed to run unattended on a schedule (see .github/workflows/sync-skills.yml).
 */

const VALID_CATEGORIES = [
  'Conversational', 'Data', 'Automation', 'Utilities', 'Healthcare', 'Compliance',
  'Developer Tools', 'Productivity', 'Research', 'Sales', 'Support', 'Education',
  'Finance', 'Legal', 'Security',
];

export type LoadedSkill = {
  file: string;
  bareId: string;
  payload: SkillPayload & { spec: SkillSpec };
  errors: string[];
};

export type SyncOptions = {
  dir: string;
  registry: string;
  token: string;
  dryRun?: boolean;
  force?: boolean;
  log?: (msg: string) => void;
};

export type SyncOutcome = 'new' | 'updated' | 'unchanged' | 'invalid' | 'failed';

export type SyncItemResult = {
  file: string;
  id: string;
  outcome: SyncOutcome;
  detail?: string;
};

export type SyncResult = {
  handle?: string;
  results: SyncItemResult[];
  published: number;
  skipped: number;
  invalid: number;
  failed: number;
};

// ---------------------------------------------------------------------------
// Parsing helpers (pure — safe to unit test)
// ---------------------------------------------------------------------------

const SKILL_EXTENSIONS = new Set(['.md', '.json']);

/** Files we never treat as skills (docs, templates, manifests, hidden files). */
export function isSkillSourceFile(fileName: string): boolean {
  if (fileName.startsWith('.') || fileName.startsWith('_')) return false;
  if (fileName.toLowerCase() === 'readme.md') return false;
  return SKILL_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleize(input: string): string {
  return input.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Minimal, dependency-free YAML front-matter parser. Supports the subset we
 * document in the template: scalars, inline arrays (`[a, b]`), block arrays
 * (`- item`), and quoted strings.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return { data: {}, body: content };

  const [, rawYaml, body] = match;
  const data: Record<string, unknown> = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentKey: string | null = null;
  let blockArray: string[] | null = null;

  const unquote = (v: string): string => {
    const t = v.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  };

  // Strip a trailing YAML inline comment (` # ...`) from an unquoted scalar.
  const stripComment = (v: string): string => {
    const t = v.trim();
    if (t.startsWith('"') || t.startsWith("'")) return t;
    if (t.startsWith('#')) return '';
    return t.replace(/\s+#.*$/, '').trim();
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const blockItem = /^\s*-\s+(.*)$/.exec(line);
    if (blockItem && currentKey) {
      blockArray = blockArray || [];
      blockArray.push(unquote(stripComment(blockItem[1])));
      data[currentKey] = blockArray;
      continue;
    }

    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    currentKey = key;
    blockArray = null;
    const value = stripComment(rawValue);

    if (value === '') {
      // value continues as a block array on following lines
      data[key] = [];
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s))
        .filter((s) => s.length > 0);
      continue;
    }
    data[key] = unquote(value);
  }

  return { data, body: body ?? '' };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).map((s) => s.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Dependencies are fully-qualified registry ids (`@handle/skill-id`). A bare id
 * is scoped to the owner's handle; an already-scoped id (possibly cross-org) is
 * preserved. Mirrors the worker so re-syncs stay idempotent.
 */
export function qualifyDependencies(deps: string[] | undefined, ownerHandle: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of deps ?? []) {
    const id = String(raw).trim();
    if (!id) continue;
    const qualified = id.startsWith('@') ? id : (ownerHandle ? `@${ownerHandle}/${id.replace(/^\/+/, '')}` : id);
    if (!seen.has(qualified)) { seen.add(qualified); out.push(qualified); }
  }
  return out;
}

function firstHeading(body: string): string | null {
  const m = /^#\s+(.+?)\s*$/m.exec(body);
  return m ? m[1].trim() : null;
}

function firstParagraph(body: string): string | null {
  const stripped = body.replace(/^#\s+.+$/m, '').trim();
  for (const block of stripped.split(/\r?\n\s*\r?\n/)) {
    const text = block.trim();
    if (text && !text.startsWith('#') && !text.startsWith('---')) {
      return text.replace(/\s+/g, ' ');
    }
  }
  return null;
}

/** Pull numbered/bulleted items out of an `## Instructions` section, if present. */
function instructionsFromBody(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inSection = /^##\s+instructions\s*$/i.test(line.trim());
      continue;
    }
    if (!inSection) continue;
    const m = /^\s*(?:\d+\.|[-*])\s+(.*)$/.exec(line);
    if (m && m[1].trim()) items.push(m[1].trim());
  }
  return items;
}

function normalizeCategory(value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return 'Utilities';
  const match = VALID_CATEGORIES.find((c) => c.toLowerCase() === v.toLowerCase());
  return match || v;
}

/** Build a registry-valid SkillSpec from markdown front-matter + body. */
export function buildSpecFromMarkdown(data: Record<string, unknown>, body: string): {
  bareId: string;
  payload: SkillPayload & { spec: SkillSpec };
} {
  const name = String(data.name || firstHeading(body) || 'Untitled Skill').trim();
  const description = String(data.description || firstParagraph(body) || name).trim();
  const category = normalizeCategory(data.category);
  const tags = asStringArray(data.tags);
  const purpose = String(data.purpose || description).trim();

  let instructions = asStringArray(data.instructions);
  if (instructions.length === 0) instructions = instructionsFromBody(body);
  if (instructions.length === 0) instructions = [description || `Apply the "${name}" skill.`];

  const promptTemplate = String(
    data.promptTemplate || data.prompt || body.trim() || name,
  ).trim();

  const dependencies = asStringArray(data.dependencies);
  const type: SkillType = (String(data.type || '').toLowerCase() === 'meta' || dependencies.length > 0) ? 'meta' : 'basic';

  const spec: SkillSpec = {
    name,
    description,
    category,
    tags,
    purpose,
    instructions,
    promptTemplate,
    examples: [],
    tests: [],
    type,
    dependencies,
  };

  const bareId = slugify(String(data.id || name));
  return {
    bareId,
    payload: {
      id: bareId,
      name,
      description,
      category,
      tags,
      spec,
      markdown: (body.trim() || promptTemplate) + '\n',
      type,
      dependencies,
    },
  };
}

export function loadSkillFromContent(file: string, content: string): LoadedSkill {
  const ext = path.extname(file).toLowerCase();
  let built: { bareId: string; payload: SkillPayload & { spec: SkillSpec } };

  if (ext === '.json') {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const fmName = String(raw.name || titleize(path.basename(file, ext))).trim();
    const specSource = (raw.spec && typeof raw.spec === 'object' ? raw.spec : raw) as Record<string, unknown>;
    const description = String(raw.description ?? specSource.description ?? '').trim();
    const category = normalizeCategory(raw.category ?? specSource.category);
    const tags = asStringArray(raw.tags ?? specSource.tags);
    let instructions = asStringArray(specSource.instructions);
    if (instructions.length === 0) instructions = [description || `Apply the "${fmName}" skill.`];
    const promptTemplate = String(
      specSource.promptTemplate || specSource.prompt || raw.markdown || description || fmName,
    ).trim();

    const dependencies = asStringArray(raw.dependencies ?? specSource.dependencies);
    const type: SkillType = (String(raw.type ?? specSource.type ?? '').toLowerCase() === 'meta' || dependencies.length > 0) ? 'meta' : 'basic';

    const spec: SkillSpec = {
      name: fmName,
      description: description || fmName,
      category,
      tags,
      purpose: String(specSource.purpose || description || fmName).trim(),
      instructions,
      promptTemplate,
      examples: Array.isArray(specSource.examples) ? (specSource.examples as SkillSpec['examples']) : [],
      tests: Array.isArray(specSource.tests) ? (specSource.tests as SkillSpec['tests']) : [],
      type,
      dependencies,
    };
    const bareId = slugify(String(raw.id || fmName));
    built = {
      bareId,
      payload: {
        id: bareId,
        name: fmName,
        description: spec.description,
        category,
        tags,
        spec,
        markdown: String(raw.markdown || promptTemplate) + (String(raw.markdown || '').endsWith('\n') ? '' : '\n'),
        type,
        dependencies,
      },
    };
  } else {
    const { data, body } = parseFrontmatter(content);
    built = buildSpecFromMarkdown(data, body);
  }

  return { file, bareId: built.bareId, payload: built.payload, errors: validateSpec(built.payload.spec, built.bareId) };
}

/** Mirrors the deployed Worker's validateSkillSpec so we can fail fast offline. */
export function validateSpec(spec: SkillSpec, bareId: string): string[] {
  const errors: string[] = [];
  if (!bareId?.trim()) errors.push('Skill id is required (set `id:` or give the file a non-empty name)');
  if (!spec.name?.trim()) errors.push('Skill name is required');
  if (!spec.description?.trim()) errors.push('Description is required');
  if (!spec.category?.trim()) errors.push('Category is required');
  if (!spec.purpose?.trim()) errors.push('Purpose is required');
  if (!Array.isArray(spec.tags)) errors.push('Tags must be an array');
  if (!Array.isArray(spec.instructions) || spec.instructions.length === 0) errors.push('At least one instruction is required');
  if (!spec.promptTemplate?.trim()) errors.push('Prompt template is required');
  if (spec.dependencies !== undefined && !Array.isArray(spec.dependencies)) errors.push('Dependencies must be a list of skill ids');
  if (spec.type === 'meta' && (!Array.isArray(spec.dependencies) || spec.dependencies.length === 0)) {
    errors.push('A meta skill must list at least one dependency');
  }
  return errors;
}

/** Compare local payload against the live skill to decide if a publish is needed. */
export function hasChanged(local: SkillPayload & { spec: SkillSpec }, remote: Skill): boolean {
  if ((local.markdown || '').trim() !== (remote.markdown || '').trim()) return true;
  if (local.name !== remote.name) return true;
  if (local.description !== remote.description) return true;
  if (local.category !== remote.category) return true;
  if (JSON.stringify(local.tags || []) !== JSON.stringify(remote.tags || [])) return true;
  if ((local.type || 'basic') !== (remote.type || 'basic')) return true;
  if (JSON.stringify(local.dependencies || []) !== JSON.stringify(remote.dependencies || [])) return true;
  if (JSON.stringify(local.spec) !== JSON.stringify(remote.spec || {})) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function findSkillFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => isSkillSourceFile(name))
    .map((name) => path.join(dir, name))
    .sort();
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const log = options.log || (() => {});
  const client = createApiClient(options.registry);
  client.setToken(options.token);

  const result: SyncResult = { results: [], published: 0, skipped: 0, invalid: 0, failed: 0 };

  // Resolve the publishing identity so we can map local ids to scoped ids.
  let handle: string | undefined;
  try {
    const me = await client.getCurrentUser();
    handle = me.user.handle;
    result.handle = handle;
    log(`Authenticated as @${handle} (${me.user.email}).`);
  } catch (error) {
    throw new Error(`Could not authenticate with ${options.registry}. Check SKILL_TOKEN. (${error instanceof Error ? error.message : String(error)})`);
  }

  // Snapshot what is already live so we only publish new/changed skills.
  const remoteById = new Map<string, Skill>();
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const list = await client.listSkills({ page, pageSize: 100 });
    for (const s of list.skills) remoteById.set(s.id, s);
    if (list.skills.length === 0 || remoteById.size >= list.total) break;
    page += 1;
    if (page > 100) break; // safety
  }
  log(`Registry currently holds ${remoteById.size} skill(s).`);

  const files = findSkillFiles(options.dir);
  log(`Found ${files.length} skill source file(s) in ${options.dir}.`);

  for (const file of files) {
    const base = path.basename(file);
    let loaded: LoadedSkill;
    try {
      loaded = loadSkillFromContent(file, fs.readFileSync(file, 'utf-8'));
    } catch (error) {
      result.invalid += 1;
      result.results.push({ file: base, id: '?', outcome: 'invalid', detail: error instanceof Error ? error.message : String(error) });
      log(`  ✗ ${base}: could not parse (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const scopedId = `@${handle}/${loaded.bareId}`;

    // Fully qualify dependencies against the publishing handle before compare/publish.
    loaded.payload.dependencies = qualifyDependencies(loaded.payload.dependencies, handle);
    if (loaded.payload.spec) loaded.payload.spec.dependencies = loaded.payload.dependencies;

    if (loaded.errors.length > 0) {
      result.invalid += 1;
      result.results.push({ file: base, id: scopedId, outcome: 'invalid', detail: loaded.errors.join('; ') });
      log(`  ✗ ${base} (${scopedId}): ${loaded.errors.join('; ')}`);
      continue;
    }

    const remote = remoteById.get(scopedId);
    const isNew = !remote;
    const changed = remote ? hasChanged(loaded.payload, remote) : true;

    if (!options.force && !isNew && !changed) {
      result.skipped += 1;
      result.results.push({ file: base, id: scopedId, outcome: 'unchanged' });
      log(`  • ${base} (${scopedId}): unchanged, skipping`);
      continue;
    }

    const outcome: SyncOutcome = isNew ? 'new' : 'updated';
    const version = remote ? (remote.version || 1) + 1 : 1;

    if (options.dryRun) {
      result.published += 1;
      result.results.push({ file: base, id: scopedId, outcome, detail: 'dry-run' });
      log(`  ↑ ${base} (${scopedId}): would publish [${outcome}] (dry-run)`);
      continue;
    }

    try {
      const response = await client.saveSkill({ ...loaded.payload, version });
      result.published += 1;
      result.results.push({ file: base, id: response.skill.id, outcome });
      log(`  ✓ ${base} (${response.skill.id}): published [${outcome}]`);
    } catch (error) {
      result.failed += 1;
      result.results.push({ file: base, id: scopedId, outcome: 'failed', detail: error instanceof Error ? error.message : String(error) });
      log(`  ✗ ${base} (${scopedId}): publish failed — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  result.invalid = result.results.filter((r) => r.outcome === 'invalid').length;
  result.failed = result.results.filter((r) => r.outcome === 'failed').length;
  return result;
}
