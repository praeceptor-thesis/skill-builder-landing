#!/usr/bin/env node
/**
 * Backfill explicit `dependencies` (and `type: "meta"`) onto existing registry
 * skills that implicitly orchestrate other skills.
 *
 * DRY-RUN BY DEFAULT — prints a report of proposed changes and writes nothing.
 * Pass --apply (with a token) to PATCH skills the token owns.
 *
 * Usage:
 *   node scripts/backfill-dependencies.mjs                       # dry-run report
 *   node scripts/backfill-dependencies.mjs --json                # machine-readable
 *   node scripts/backfill-dependencies.mjs --apply --token <t>   # apply (owner only)
 *   node scripts/backfill-dependencies.mjs --apply --include-medium
 *
 * Options:
 *   --registry <url>     Registry API base (default: env SKILL_API_URL or the prod API)
 *   --token <token>      Auth token (default: env SKILL_TOKEN). Required for --apply.
 *   --apply              Actually PATCH skills (otherwise dry-run).
 *   --include-medium     Also apply medium-confidence candidates (default: curated + high only).
 *   --json               Print the classification as JSON instead of a report.
 *
 * Prerequisite for --apply: the registry must run the worker build that understands
 * `type`/`dependencies` (the API derives `type` and regenerates markdown on save).
 * The dry-run report works against any deployed version (read-only).
 */

import { classifyRegistry } from './lib/detect-meta.mjs';

const DEFAULT_API = process.env.SKILL_API_URL || 'https://skills.eastern-shore-solutions.com/api';

function parseArgs(argv) {
  const args = { registry: DEFAULT_API, token: process.env.SKILL_TOKEN || '', apply: false, includeMedium: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--include-medium') args.includeMedium = true;
    else if (a === '--json') args.json = true;
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--token') args.token = argv[++i];
  }
  args.registry = args.registry.replace(/\/+$/, '');
  if (!/\/api$/.test(args.registry)) args.registry += '/api';
  return args;
}

async function api(path, { method = 'GET', token, body } = {}, registry) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${registry}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ ok: false, error: { message: res.statusText } }));
  if (!json.ok) throw new Error(json.error?.message || `Request failed: ${res.status}`);
  return json.data;
}

async function fetchAllSkills(registry) {
  const all = [];
  let page = 1;
  const pageSize = 50;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await api(`/skills?page=${page}&pageSize=${pageSize}`, {}, registry);
    all.push(...(data.skills || []));
    const total = data.total ?? all.length;
    if (all.length >= total || (data.skills || []).length === 0) break;
    page += 1;
    if (page > 200) break; // safety
  }
  return all;
}

const LABEL = {
  curated: 'CURATED ',
  high: 'HIGH    ',
  medium: 'MEDIUM  ',
  'meta-no-deps': 'REVIEW  ',
};

function printReport(results, applySet) {
  const withDeps = results.filter((r) => r.dependencies.length > 0);
  const reviewOnly = results.filter((r) => r.dependencies.length === 0);

  console.log(`\nFound ${withDeps.length} skill(s) with detectable dependencies` + (reviewOnly.length ? `, plus ${reviewOnly.length} meta-flavored skill(s) with no concrete dependency.` : '.'));
  console.log('');

  for (const r of withDeps) {
    const mark = applySet.has(r.id) ? '✓ will apply' : '· review';
    console.log(`[${LABEL[r.confidence] || r.confidence}] ${r.id}   ${mark}`);
    console.log(`    type: meta   dependencies: ${r.dependencies.join(', ')}`);
    if (r.source === 'detected') {
      const sigs = [...new Set(r.detections.map((d) => d.signal))].join(', ');
      const ev = r.detections[0]?.evidence;
      console.log(`    signal: ${sigs}${r.metaSignal ? ' + meta-language' : ''}`);
      if (ev) console.log(`    evidence: "${ev}"`);
    } else {
      console.log('    source: curated mapping');
    }
    if (r.missingCurated?.length) console.log(`    ⚠ curated dep(s) not found in registry: ${r.missingCurated.join(', ')}`);
    console.log('');
  }

  if (reviewOnly.length) {
    console.log('Meta-flavored, but no concrete registry dependency detected (manual review):');
    for (const r of reviewOnly) console.log(`    · ${r.id} — ${r.name}`);
    console.log('');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Registry: ${args.registry}`);
  console.log('Fetching skills…');
  const skills = await fetchAllSkills(args.registry);
  console.log(`Loaded ${skills.length} skill(s).`);

  const { results } = classifyRegistry(skills);

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // What we'd apply: curated + high by default; medium if opted in. Needs deps.
  const applicable = results.filter(
    (r) => r.dependencies.length > 0 && (r.confidence === 'curated' || r.confidence === 'high' || (args.includeMedium && r.confidence === 'medium')),
  );
  const applySet = new Set(applicable.map((r) => r.id));

  printReport(results, applySet);

  if (!args.apply) {
    console.log(`Dry run — no changes written. ${applicable.length} skill(s) would be updated with --apply` + (args.includeMedium ? '' : ' (add --include-medium to include medium-confidence)') + '.');
    return;
  }

  if (!args.token) {
    console.error('--apply requires a token. Pass --token <t> or set SKILL_TOKEN.');
    process.exit(1);
  }

  let me;
  try {
    me = await api('/auth/me', { token: args.token }, args.registry);
  } catch (e) {
    console.error(`Could not authenticate: ${e.message}`);
    process.exit(1);
  }
  const handle = me.user.handle;
  console.log(`\nApplying as @${handle}. (Only skills you own can be updated.)\n`);

  const { index } = classifyRegistry(skills);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of applicable) {
    const existing = index.byId.get(r.id);
    if (!existing) { skipped += 1; continue; }
    if ((existing.authorHandle || '') !== handle) {
      console.log(`  · skip ${r.id} (owned by @${existing.authorHandle || 'unknown'}, not @${handle})`);
      skipped += 1;
      continue;
    }
    const spec = { ...(existing.spec || {}), type: 'meta', dependencies: r.dependencies };
    try {
      await api(`/skills/${encodeURIComponent(r.id)}`, { method: 'PATCH', token: args.token, body: { spec, type: 'meta', dependencies: r.dependencies } }, args.registry);
      console.log(`  ✓ ${r.id} → dependencies: ${r.dependencies.join(', ')}`);
      updated += 1;
    } catch (e) {
      console.log(`  ✗ ${r.id} — ${e.message}`);
      failed += 1;
    }
  }
  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('backfill failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
