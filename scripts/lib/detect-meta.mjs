/**
 * Meta-skill dependency detection.
 *
 * Pure, dependency-free functions (safe to unit test) that read a registry of
 * skills and decide which ones are *meta* skills — i.e. they orchestrate or
 * depend on other real skills in the registry — and what those dependencies are.
 *
 * Detection is layered, from strongest to weakest signal:
 *   id          — another skill's full id appears verbatim (e.g. @h/slug)
 *   install     — an `install <id>` / `skill-builder install <id>` directive
 *   name        — another skill's distinctive full name appears verbatim
 *   name-fuzzy  — the skill's name tokens appear as a phrase (camelCase or spaced)
 *
 * Orchestration language ("orchestrates", "pipeline of skills", "sub-skill",
 * "meta-skill" tag, …) raises confidence that a skill is meta but does not by
 * itself create a dependency.
 *
 * Curated overrides force known-correct mappings regardless of heuristics.
 */

/** Known-correct mappings, keyed by full skill id. */
export const CURATED_OVERRIDES = {
  '@dmz_agent/turing-iterator': ['@dmz_agent/diary', '@dmz_agent/present', '@dmz_agent/roadmap'],
  '@design_seeder/brand-style-guide-generator': ['@design_seeder/typography-system-builder'],
  '@ess_seeder/skill-composer': ['@ess_seeder/sequential-pipeline', '@ess_seeder/parallel-swarm'],
};

/** Orchestration / meta language that suggests a skill coordinates others. */
export const META_SIGNAL_RE =
  /\b(orchestrat\w+|sub-?skills?|pipeline of skills|chains? together|chain of skills|delegat\w+ to|composes?\s+\w+\s+skills?|combine[sd]?\s+(?:the\s+)?\w*\s*skills?|invoke[sd]?\s+the\s+\w+\s+skill|bundles?\s+(?:the\s+)?skills?|meta-?skill)\b/i;

const TEXT_FIELDS = ['description', 'purpose', 'promptTemplate'];

/** Split a name into lowercase word tokens, breaking camelCase and punctuation. */
export function nameTokens(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> spaced
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Doubled-handle ids like `@h/@h/x` are test artifacts — never treat as deps. */
export function isMalformedId(id) {
  if (typeof id !== 'string' || !id) return true;
  return (id.match(/@/g) || []).length > 1 || id.includes('/@');
}

/** Concatenate every text surface of a skill we should search for references. */
export function buildHaystack(skill) {
  const parts = [];
  for (const f of TEXT_FIELDS) {
    if (skill?.[f]) parts.push(String(skill[f]));
    if (skill?.spec?.[f]) parts.push(String(skill.spec[f]));
  }
  const instructions = skill?.spec?.instructions ?? skill?.instructions;
  if (Array.isArray(instructions)) parts.push(instructions.join('\n'));
  if (skill?.markdown) parts.push(String(skill.markdown));
  if (Array.isArray(skill?.tags)) parts.push(skill.tags.join(' '));
  return parts.join('\n');
}

/** A name distinctive enough that a verbatim match is meaningful (not a common word). */
export function isDistinctiveName(name) {
  const n = String(name || '').trim();
  if (n.length < 6) return false;
  const tokens = nameTokens(n);
  if (tokens.length >= 2) return true; // multi-word
  if (/[a-z][A-Z]/.test(n)) return true; // camelCase
  return n.length >= 8; // long single word
}

export function buildIndex(skills) {
  const byId = new Map();
  const byHandle = new Map();
  const entries = [];
  for (const s of skills) {
    if (!s || !s.id || isMalformedId(s.id)) continue;
    byId.set(s.id, s);
    const handle = s.authorHandle || '';
    if (handle) byHandle.set(handle, (byHandle.get(handle) || 0) + 1);
    entries.push({ id: s.id, name: s.name || '', handle, tokens: nameTokens(s.name || '') });
  }
  return { byId, byHandle, entries };
}

function snippet(haystack, needle) {
  const i = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (i === -1) return '';
  const start = Math.max(0, i - 30);
  const end = Math.min(haystack.length, i + needle.length + 40);
  return (start > 0 ? '…' : '') + haystack.slice(start, end).replace(/\s+/g, ' ').trim() + (end < haystack.length ? '…' : '');
}

function phraseAppears(hayLower, tokens) {
  if (tokens.length < 2) return false;
  const spaced = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]{1,3}'), 'i');
  if (spaced.test(hayLower)) return true;
  return hayLower.includes(tokens.join('')); // camelCase concatenation
}

/**
 * Detect references from `skill` to other real skills in `index`.
 * Returns [{ id, signal, strength, evidence }] (strength 3=id/install, 2=name, 1=fuzzy).
 */
export function detectDependencies(skill, index) {
  const out = [];
  if (!skill || isMalformedId(skill.id)) return out;
  const hayRaw = buildHaystack(skill);
  const hay = hayRaw.toLowerCase();
  if (!hay.trim()) return out;

  for (const t of index.entries) {
    if (t.id === skill.id) continue;
    const idLower = t.id.toLowerCase();
    const bareSlug = t.id.includes('/') ? t.id.slice(t.id.indexOf('/') + 1) : t.id;

    let signal = null;
    let strength = 0;
    let evidence = '';

    if (hay.includes(idLower)) {
      signal = 'id';
      strength = 3;
      evidence = snippet(hayRaw, t.id);
    } else if (new RegExp(`install\\s+@?[\\w/-]*${bareSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay)) {
      signal = 'install';
      strength = 3;
      evidence = snippet(hayRaw, bareSlug);
    } else if (t.name && isDistinctiveName(t.name) && hay.includes(t.name.toLowerCase())) {
      signal = 'name';
      strength = 2;
      evidence = snippet(hayRaw, t.name);
    } else if (t.tokens.length >= 2 && phraseAppears(hay, t.tokens)) {
      signal = 'name-fuzzy';
      strength = 1;
      evidence = snippet(hayRaw, t.tokens.join(' '));
    }

    if (strength > 0) out.push({ id: t.id, signal, strength, evidence });
  }
  return out;
}

export function hasMetaSignal(skill) {
  const tagged = Array.isArray(skill?.tags) && skill.tags.some((t) => /meta-?skill|orchestrat|bundle/i.test(String(t)));
  return tagged || META_SIGNAL_RE.test(buildHaystack(skill));
}

/**
 * Classify a single skill. Returns:
 * { id, isMeta, dependencies, confidence, source, metaSignal, detections, missingCurated }
 * confidence ∈ 'curated' | 'high' | 'medium' | 'meta-no-deps' | 'none'
 */
export function classifySkill(skill, index) {
  const detections = detectDependencies(skill, index);
  const metaSignal = hasMetaSignal(skill);

  // Curated overrides win, but only keep dependency ids that actually exist.
  const curated = CURATED_OVERRIDES[skill.id];
  if (curated) {
    const dependencies = curated.filter((id) => index.byId.has(id));
    const missingCurated = curated.filter((id) => !index.byId.has(id));
    return { id: skill.id, isMeta: true, dependencies, confidence: 'curated', source: 'curated', metaSignal, detections, missingCurated };
  }

  const dependencies = [...new Set(detections.map((d) => d.id))];
  const maxStrength = detections.reduce((m, d) => Math.max(m, d.strength), 0);

  let confidence = 'none';
  if (dependencies.length > 0) {
    if (maxStrength >= 3) confidence = 'high';
    else if (maxStrength === 2) confidence = metaSignal ? 'high' : 'medium';
    else confidence = 'medium';
  } else if (metaSignal) {
    confidence = 'meta-no-deps';
  }

  return {
    id: skill.id,
    isMeta: dependencies.length > 0,
    dependencies,
    confidence,
    source: 'detected',
    metaSignal,
    detections,
    missingCurated: [],
  };
}

const RANK = { curated: 0, high: 1, medium: 2, 'meta-no-deps': 3, none: 4 };

/** Classify every skill; return only the meta candidates / review items, ranked. */
export function classifyRegistry(skills) {
  const index = buildIndex(skills);
  const results = [];
  for (const s of index.byId.values()) {
    const r = classifySkill(s, index);
    if (r.dependencies.length > 0 || r.confidence === 'meta-no-deps') {
      results.push({ ...r, name: s.name, authorHandle: s.authorHandle || '' });
    }
  }
  results.sort((a, b) => (RANK[a.confidence] - RANK[b.confidence]) || a.id.localeCompare(b.id));
  return { index, results };
}
