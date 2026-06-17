#!/usr/bin/env node
// migrate-zone.mjs — copy every skill from one registry zone to another.
//
// Built for the skills.dmzagent.com cut-over: pull all skills out of the OLD
// registry's API (skills.eastern-shore-solutions.com) and (re)publish them into
// the NEW zone's registry (skills.dmzagent.com). Safe to re-run — publishing the
// same id overwrites, so a partial run just resumes.
//
// Usage (run from a network that can reach BOTH zones — e.g. your Mac):
//   SKILL_TOKEN=skb_… node scripts/migrate-zone.mjs \
//     --from https://skills.eastern-shore-solutions.com/api \
//     --to   https://skills.dmzagent.com/api
//
// Options (pick ONE source — a live URL or a saved JSON dump):
//   --from <url>       Old registry API base (the site that HAS the data).
//   --from-file <path> A saved registry dump instead of a live read. Accepts the raw
//                      `/api/skills` response ({data:{skills:[…]}}), a {skills:[…]}
//                      object, or a bare [ … ] array. Use this when the old site is
//                      flaky/decommissioned but you already have the JSON.
//   --to <url>         New registry API base. Default: https://skills.dmzagent.com/api
//   --token <tok>      Target write token. Default: $SKILL_TOKEN (a long-lived skb_… token)
//   --dry-run          Read + plan only; never POST. No token needed.
//   --yes              Skip the 3-second "about to write" pause.
//   --limit <n>        Only migrate the first n skills (after ordering). For a test run.
//
// Note on ownership: the target Worker re-scopes every skill under the handle your
// SKILL_TOKEN belongs to, so all uploaded skills end up owned by that one account
// (original author handles are not preserved).
//
// What it does:
//   1. Pages through {from}/skills (full records, including spec + markdown).
//   2. Orders basic skills before meta skills so dependencies exist first.
//   3. POSTs each to {to}/skills with your token. The Worker re-scopes the id
//      under your handle and preserves createdAt / downloads / version.
//
// Exit code: 0 if every skill published (or dry-run); 1 if any failed.

import * as fs from 'fs';

const DEFAULT_TO = 'https://skills.dmzagent.com/api';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--from-file') out.fromFile = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--token') out.token = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  return out;
}

const stripBase = (u) => String(u || '').replace(/\/+$/, '');
const bareId = (id) => String(id || '').replace(/^@[^/]+\//, '');

// ---------------------------------------------------------------------------
// HTTP (small retry + timeout; throws a clear error on a non-JSON envelope)
// ---------------------------------------------------------------------------
async function api(url, { method = 'GET', token, body, retries = 3, timeoutMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = { accept: 'application/json' };
      if (body) headers['content-type'] = 'application/json';
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); }
      catch {
        // A registry route returns JSON. HTML here means the API isn't routed at
        // this host (you'll get the SPA index.html) — fail loudly, don't guess.
        throw new Error(`${method} ${url} -> HTTP ${res.status} returned non-JSON (got "${text.slice(0, 60).replace(/\s+/g, ' ')}…"). Is the API actually served at this host?`);
      }
      if (json && json.ok === false) {
        const msg = json.error?.message || `HTTP ${res.status}`;
        // Auth / validation errors won't fix themselves on retry.
        throw new Error(msg);
      }
      return json.data ?? json;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') lastErr = new Error(`${method} ${url} timed out after ${timeoutMs}ms`);
      else if (e.cause) lastErr = new Error(`${e.message} — ${e.cause.code || e.cause.message || e.cause} (${url})`);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

// Read a saved dump: the raw /api/skills envelope, {skills:[…]}, or a bare array.
function loadSkillsFromFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.skills)) return raw.skills;
  if (raw.data && Array.isArray(raw.data.skills)) return raw.data.skills;
  throw new Error('No skills array found in the file (expected [ … ], {skills:[…]}, or {data:{skills:[…]}}).');
}

async function fetchAllSkills(fromBase) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const data = await api(`${fromBase}/skills?sort=recent&pageSize=100&page=${page}`);
    const skills = data?.skills || [];
    all.push(...skills);
    const total = data?.total ?? all.length;
    if (skills.length === 0 || all.length >= total) break;
  }
  return all;
}

// Basic skills first so a meta skill's dependencies already exist on the target.
function orderForPublish(skills) {
  const isMeta = (s) => (s.type === 'meta') || (Array.isArray(s.dependencies) && s.dependencies.length > 0);
  return [...skills].sort((a, b) => Number(isMeta(a)) - Number(isMeta(b)));
}

function toPayload(s) {
  return {
    id: bareId(s.id),            // Worker re-scopes to @<your-handle>/<id>
    spec: s.spec,                // required by POST /api/skills
    markdown: s.markdown,
    type: s.type,
    dependencies: s.dependencies, // already fully-qualified (@handle/dep); passed through
    version: s.version,
    downloads: s.downloads,
    createdAt: s.createdAt,
    forkedFrom: s.forkedFrom,
  };
}

// ---------------------------------------------------------------------------
function log(msg) { process.stdout.write(`${msg}\n`); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = stripBase(args.from);
  const to = stripBase(args.to || DEFAULT_TO);
  const token = args.token || process.env.SKILL_TOKEN || '';

  if (!from && !args.fromFile) {
    console.error('Error: give a source — either --from <oldApiBase> or --from-file <dump.json>.');
    process.exit(2);
  }
  if (from && args.fromFile) {
    console.error('Error: use either --from or --from-file, not both.');
    process.exit(2);
  }
  if (from && from === to) {
    console.error(`Error: --from and --to are the same host (${to}). Nothing to migrate.`);
    process.exit(2);
  }
  if (!args.dryRun && !token) {
    console.error('Error: no write token. Set SKILL_TOKEN (a long-lived skb_… token) or pass --token, or use --dry-run.');
    process.exit(2);
  }

  const sourceLabel = args.fromFile ? `file:${args.fromFile}` : from;
  log(`Source (read):  ${sourceLabel}`);
  log(`Target (write): ${to}${args.dryRun ? '  [dry-run: nothing will be written]' : ''}`);

  log(`\nReading source ${args.fromFile ? 'dump' : 'registry'}…`);
  let skills;
  try {
    skills = args.fromFile ? loadSkillsFromFile(args.fromFile) : await fetchAllSkills(from);
  } catch (e) {
    console.error(`\nCould not read the source: ${e.message}`);
    process.exit(1);
  }
  log(`Found ${skills.length} skill(s) on the source.`);
  if (skills.length === 0) { log('Nothing to migrate.'); return; }

  let ordered = orderForPublish(skills);
  if (Number.isFinite(args.limit) && args.limit > 0) ordered = ordered.slice(0, args.limit);

  // Skip records the target would reject (POST /api/skills requires a spec).
  const skipped = ordered.filter((s) => !s.spec);
  const publishable = ordered.filter((s) => s.spec);
  for (const s of skipped) log(`  skip  ${s.id}  (no spec — markdown-only records can't be published)`);

  if (args.dryRun) {
    log('\nWould publish (in this order):');
    for (const s of publishable) log(`  copy  ${bareId(s.id)}  ${s.type === 'meta' ? '[meta]' : ''}`);
    log(`\nDry run: ${publishable.length} would publish, ${skipped.length} skipped. No changes made.`);
    return;
  }

  // Pre-flight the TARGET before writing anything: confirm it's a real registry
  // (JSON envelope, not the static SPA) and that the token authenticates there.
  // Catches "route not live yet" / "wrong token" in one call instead of N failed POSTs.
  try {
    const me = await api(`${to}/auth/me`, { token });
    log(`\nTarget OK — authenticated as @${me?.user?.handle || 'unknown'} on ${to}.`);
  } catch (e) {
    console.error(`\nTarget pre-flight failed: ${e.message}`);
    console.error('The destination must be a live registry API that your token is valid on. Nothing was written.');
    process.exit(1);
  }

  if (!args.yes) {
    log(`About to publish ${publishable.length} skill(s) to ${to}. Ctrl-C to abort…`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  let published = 0;
  const failures = [];
  log('');
  for (const s of publishable) {
    const id = bareId(s.id);
    try {
      await api(`${to}/skills`, { method: 'POST', token, body: toPayload(s) });
      published++;
      log(`  ok    ${id}`);
    } catch (e) {
      failures.push({ id, error: e.message });
      log(`  FAIL  ${id}  — ${e.message}`);
    }
  }

  log(`\nDone: ${published} published, ${skipped.length} skipped, ${failures.length} failed (of ${ordered.length} read).`);
  if (failures.length) {
    log('Failed ids (safe to re-run — publishing is idempotent):');
    for (const f of failures) log(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
