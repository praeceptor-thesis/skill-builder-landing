#!/usr/bin/env node
// Weekly "Skill Forge" digest generator.
//
// Deterministic: pulls the registry, analyzes it, and writes an email-ready
// HTML newsletter + plain-text version + a JSON summary. The weekly scheduled
// task runs this and drafts the output to Gmail.
//
// Sensible defaults (override via env):
//   REGISTRY        registry API base   (default https://skills.dmzagent.com/api — the new zone)
//   OWNER_HANDLE    "your bench" handle (default kmd_ai)
//   NEW_WINDOW_DAYS "new this week"     (default 7)
//   TOP_N           top-downloads count (default 5)
//   INNOVATIVE_N    innovative picks    (default 4)
//   CATEGORIES_SHOWN category bars      (default 7)
//   OUT_DIR         output directory    (default the system temp dir)
//   DIGEST_FIXTURE  path to a JSON array of skills (for testing/offline; skips network)
//
// Delivery (Resend HTTP API — https://resend.com/docs):
//   RESEND_API_KEY  Resend API key      (required for --send to actually send)
//   MAIL_TO         recipient           (default matt@eastern-shore-solutions.com)
//   MAIL_FROM       sender              (default forge@skills.dmzagent.com — the
//                                        Resend-verified domain; MUST stay on a
//                                        domain verified in Resend or sends fail)
//   Flags: --send     deliver via Resend (no-op + sendError if no key)
//          --dry-run  build everything but never call the API
//   With no flag the script only writes the two files, exactly as before.
//
// Fallbacks (so a run always produces something usable):
//   - registry unreachable / fixture missing -> a short "service notice" digest
//   - zero skills                             -> service notice
//   - no skills in the new-window             -> "Recently added" (most-recent N)
//   - every skill has 0 downloads             -> "Freshly published" instead of a chart
//   - no skills match "innovative"            -> fall back to the most distinctive newest
//   - owner handle has no skills              -> "From your bench" section omitted

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Best-effort: load the repo-root .env so delivery vars (RESEND_API_KEY, MAIL_FROM,
// MAIL_TO) are available when the scheduled task runs this script directly.
try {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch { /* no .env, or older Node — fall back to real env vars */ }

const CFG = {
  registry: (process.env.REGISTRY || 'https://skills.dmzagent.com/api').replace(/\/+$/, ''),
  owner: (process.env.OWNER_HANDLE || 'kmd_ai').replace(/^@/, ''),
  newWindowDays: num(process.env.NEW_WINDOW_DAYS, 7),
  topN: num(process.env.TOP_N, 5),
  innovativeN: num(process.env.INNOVATIVE_N, 4),
  categoriesShown: num(process.env.CATEGORIES_SHOWN, 7),
  outDir: process.env.OUT_DIR || os.tmpdir(),
  fixture: process.env.DIGEST_FIXTURE || '',
  // Issue #1 = week of Mon 2026-06-15.
  issueEpoch: Date.UTC(2026, 5, 15),
};

function num(v, d) { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 ? n : d; }
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const INSTALL = (id) => `npx @concordex-ai/skill-builder install ${id}`;
const INNOVATIVE_RE = /orchestrat|compos|pipeline|router|route|swarm|workflow|\bagent\b|loop|handoff|meta|chain|graph|conduct/i;

// ---------------------------------------------------------------------------
// Data loading (network with retry/timeout, or a fixture)
// ---------------------------------------------------------------------------

export async function loadSkills(cfg = CFG) {
  if (cfg.fixture) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfg.fixture, 'utf-8'));
      const skills = Array.isArray(raw) ? raw : (raw.skills || []);
      return { skills, error: null };
    } catch (e) {
      return { skills: [], error: `fixture load failed: ${e.message}` };
    }
  }

  const all = [];
  try {
    for (let page = 1; page <= 50; page++) {
      const data = await fetchJson(`${cfg.registry}/skills?sort=recent&pageSize=100&page=${page}`);
      const skills = data?.skills || [];
      all.push(...skills);
      const total = data?.total ?? all.length;
      if (skills.length === 0 || all.length >= total) break;
    }
    return { skills: all, error: null };
  } catch (e) {
    // Return whatever we managed to collect; flag the error for the fallback path.
    return { skills: all, error: e.message };
  }
}

async function fetchJson(url, { retries = 3, timeoutMs = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      clearTimeout(t);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const body = await res.json();
      if (body && body.ok === false) { lastErr = new Error(body.error?.message || 'API error'); continue; }
      return body?.data ?? body;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
  }
  throw lastErr || new Error('request failed');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Analysis (pure)
// ---------------------------------------------------------------------------

export function analyze(skills, cfg = CFG, now = Date.now()) {
  const norm = skills.map((s) => ({
    id: s.id,
    name: s.name || s.id || 'Untitled',
    handle: (s.authorHandle || s.handle || (s.author && s.author.handle) || '').replace(/^@/, ''),
    category: s.category || (s.spec && s.spec.category) || 'Uncategorized',
    downloads: Number(s.downloads) || 0,
    deps: Array.isArray(s.dependencies) ? s.dependencies.length : (s.deps || 0),
    type: s.type || ((Array.isArray(s.dependencies) && s.dependencies.length) ? 'meta' : 'basic'),
    updatedAt: s.updatedAt || s.createdAt || null,
    desc: (s.description || '').trim(),
  }));

  const ageDays = (s) => s.updatedAt ? (now - new Date(s.updatedAt).getTime()) / 86400000 : Infinity;
  const recent = [...norm].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const authors = [...new Set(norm.map((s) => s.handle).filter(Boolean))];

  // Top downloads — with a fallback when nothing has been installed yet.
  const anyDownloads = norm.some((s) => s.downloads > 0);
  const topDownloads = [...norm].sort((a, b) => b.downloads - a.downloads).slice(0, cfg.topN);
  const topSection = anyDownloads
    ? { mode: 'downloads', title: 'Top of the charts', items: topDownloads.filter((s) => s.downloads > 0).slice(0, cfg.topN) }
    : { mode: 'fresh', title: 'Freshly published', items: recent.slice(0, cfg.topN), note: 'No installs recorded yet — these are the newest arrivals.' };

  // New this week — fall back to most-recent if the window is empty.
  const newThisWeek = recent.filter((s) => ageDays(s) <= cfg.newWindowDays);
  const newSection = newThisWeek.length
    ? { mode: 'new', title: `New this week (${newThisWeek.length})`, items: newThisWeek.slice(0, 8) }
    : { mode: 'recent', title: 'Recently added', items: recent.slice(0, 6) };

  // Innovative — meta/orchestration first, else most distinctive newest.
  const featuredIds = new Set(topSection.items.map((s) => s.id));
  let innovative = norm
    .filter((s) => !featuredIds.has(s.id))
    .filter((s) => s.deps > 0 || INNOVATIVE_RE.test(`${s.name} ${s.desc}`))
    .sort((a, b) => (b.deps - a.deps) || (b.downloads - a.downloads));
  let innovativeMode = 'matched';
  if (innovative.length === 0) {
    innovativeMode = 'fallback';
    innovative = recent.filter((s) => !featuredIds.has(s.id) && s.desc.length > 40).slice(0, cfg.innovativeN);
  }
  innovative = innovative.slice(0, cfg.innovativeN);

  // Owner ("your bench") — omit if the owner has nothing.
  const ownerSkills = [...norm].filter((s) => s.handle === cfg.owner).sort((a, b) => b.downloads - a.downloads);

  // Category counts (top N for the bars).
  const catCounts = {};
  norm.forEach((s) => { catCounts[s.category] = (catCounts[s.category] || 0) + 1; });
  const categories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, cfg.categoriesShown);

  return {
    issueNo: Math.max(1, Math.floor((now - cfg.issueEpoch) / (7 * 86400000)) + 1),
    dateLabel: new Date(now).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    total: norm.length,
    authorCount: authors.length,
    categoryCount: Object.keys(catCounts).length,
    owner: cfg.owner,
    topSection,
    newSection,
    innovative,
    innovativeMode,
    ownerSkills,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PALETTE = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

export function renderHtml(m) {
  const wrap = (inner) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2330;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
${inner}
</table></td></tr></table></body></html>`;

  const masthead = `<tr><td style="background:#0f172a;padding:28px 32px;">
    <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7dd3fc;font-weight:700;">The Skill Forge</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-top:6px;line-height:1.2;">Weekly Skill Digest</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:8px;">Issue #${m.issueNo} &middot; ${esc(m.dateLabel)} &middot; skills.dmzagent.com</div>
  </td></tr>`;

  if (m.notice) {
    return wrap(masthead + `<tr><td style="padding:30px 32px;"><p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${esc(m.notice)}</p></td></tr>`);
  }

  const heading = (t) => `<tr><td style="padding:26px 32px 4px 32px;"><div style="font-size:17px;font-weight:800;color:#0f172a;border-bottom:2px solid #0f172a;padding-bottom:6px;">${t}</div></td></tr>`;
  const card = (s, badge) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;"><tr><td style="padding:16px 18px;">
    <div><span style="display:inline-block;background:#f1f5f9;color:#334155;font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;">${badge}</span> <span style="display:inline-block;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:600;padding:3px 8px;border-radius:99px;">${esc(s.category)}</span></div>
    <div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:8px;">${esc(s.name)} <span style="color:#64748b;font-weight:500;font-size:13px;">@${esc(s.handle || 'unknown')}</span></div>
    ${s.desc ? `<div style="font-size:13px;line-height:1.55;color:#475569;margin-top:4px;">${esc(s.desc.slice(0, 180))}</div>` : ''}
    ${s.id ? `<div style="font-size:12px;color:#0369a1;margin-top:8px;font-family:ui-monospace,Menlo,monospace;">${esc(INSTALL(s.id))}</div>` : ''}
  </td></tr></table>`;
  const li = (s) => `<li><strong>${esc(s.name)}</strong> <span style="color:#64748b;">@${esc(s.handle || 'unknown')}</span>${s.desc ? ` &mdash; ${esc(s.desc.slice(0, 140))}` : ''}</li>`;

  const intro = `<tr><td style="padding:28px 32px 8px 32px;"><p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">
    <strong>${m.total} skill${m.total === 1 ? '' : 's'}</strong> from <strong>${m.authorCount} builder${m.authorCount === 1 ? '' : 's'}</strong> across ${m.categoryCount} categories. Your claw publishes autonomously under <strong>@${esc(m.owner)}</strong> on Claude Opus 4.8 — here's what's worth a look.
  </p></td></tr>`;

  const stats = `<tr><td style="padding:14px 32px 6px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;"><tr>
    <td width="33%" align="center" style="padding:16px 8px;border-right:1px solid #e2e8f0;"><div style="font-size:24px;font-weight:800;color:#0f172a;">${m.total}</div><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;">skills</div></td>
    <td width="33%" align="center" style="padding:16px 8px;border-right:1px solid #e2e8f0;"><div style="font-size:24px;font-weight:800;color:#0f172a;">${m.authorCount}</div><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;">builders</div></td>
    <td width="33%" align="center" style="padding:16px 8px;"><div style="font-size:24px;font-weight:800;color:#0f172a;">${m.categoryCount}</div><div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;">categories</div></td>
  </tr></table></td></tr>`;

  // Top section
  let topBadge = (s, i) => m.topSection.mode === 'downloads'
    ? `#${i + 1} &middot; ${s.downloads} install${s.downloads === 1 ? '' : 's'}`
    : 'New';
  const topBlock = heading('&#128200; ' + m.topSection.title) +
    `<tr><td style="padding:14px 32px 0 32px;">${m.topSection.note ? `<p style="margin:0 0 10px 0;font-size:13px;color:#64748b;">${esc(m.topSection.note)}</p>` : ''}${m.topSection.items.map((s, i) => card(s, topBadge(s, i))).join('')}</td></tr>`;

  // Owner section
  const ownerBlock = m.ownerSkills.length
    ? heading('&#129302; From your bench &middot; @' + esc(m.owner)) +
      `<tr><td style="padding:12px 32px 0 32px;"><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#334155;">${m.ownerSkills.slice(0, 5).map(li).join('')}</ul></td></tr>`
    : '';

  // Innovative
  const innovativeBlock = m.innovative.length
    ? heading('&#10024; Innovative this week') +
      `<tr><td style="padding:12px 32px 0 32px;"><p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#334155;">${m.innovativeMode === 'matched' ? 'Skills that compose or orchestrate other skills:' : 'A few fresh, substantial skills:'}</p><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#334155;">${m.innovative.map(li).join('')}</ul></td></tr>`
    : '';

  // New / recent
  const newBlock = heading('&#128228; ' + m.newSection.title) +
    `<tr><td style="padding:12px 32px 0 32px;"><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#334155;">${m.newSection.items.map(li).join('')}</ul></td></tr>`;

  // By the numbers
  const maxCat = Math.max(1, ...m.categories.map(([, n]) => n));
  const catRows = m.categories.map(([cat, n], i) => `<tr><td style="padding:3px 0;width:150px;">${esc(cat)}</td><td style="padding:3px 0;"><span style="display:inline-block;height:10px;width:${Math.round((n / maxCat) * 170)}px;background:${PALETTE[i % PALETTE.length]};border-radius:3px;vertical-align:middle;"></span> ${n}</td></tr>`).join('');
  const numbersBlock = heading('&#128202; By the numbers') +
    `<tr><td style="padding:14px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">${catRows}</table></td></tr>`;

  const cta = `<tr><td style="padding:28px 32px 30px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;"><tr><td style="padding:22px 24px;" align="center">
    <div style="font-size:15px;font-weight:700;color:#fff;">Browse the full registry</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${m.total} skills and growing.</div>
    <a href="https://skills.dmzagent.com/browse" style="display:inline-block;margin-top:14px;background:#38bdf8;color:#0f172a;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:8px;">Open the registry &rarr;</a>
  </td></tr></table></td></tr>`;

  const footer = `<tr><td style="padding:0 32px 28px 32px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px 0;"><div style="font-size:11px;color:#94a3b8;line-height:1.6;">The Skill Forge &middot; generated automatically from your skill registry.<br>Install any skill with <span style="font-family:ui-monospace,Menlo,monospace;">npx @concordex-ai/skill-builder install &lt;id&gt;</span></div></td></tr>`;

  return wrap(masthead + intro + stats + topBlock + ownerBlock + innovativeBlock + newBlock + numbersBlock + cta + footer);
}

export function renderText(m) {
  if (m.notice) return `THE SKILL FORGE — Weekly Skill Digest\nIssue #${m.issueNo} · ${m.dateLabel}\n\n${m.notice}\n`;
  const lines = [];
  lines.push(`THE SKILL FORGE — Weekly Skill Digest`, `Issue #${m.issueNo} · ${m.dateLabel} · skills.dmzagent.com`, '');
  lines.push(`${m.total} skills from ${m.authorCount} builders across ${m.categoryCount} categories. Your claw publishes under @${m.owner} on Claude Opus 4.8.`, '');
  lines.push(m.topSection.title.toUpperCase());
  if (m.topSection.note) lines.push(`(${m.topSection.note})`);
  m.topSection.items.forEach((s, i) => {
    const badge = m.topSection.mode === 'downloads' ? `${i + 1}. ${s.name} — ${s.downloads} install(s)` : `- ${s.name}`;
    lines.push(`${badge} (@${s.handle || 'unknown'})`);
    if (s.id) lines.push(`   ${INSTALL(s.id)}`);
  });
  lines.push('');
  if (m.ownerSkills.length) {
    lines.push(`FROM YOUR BENCH (@${m.owner})`);
    m.ownerSkills.slice(0, 5).forEach((s) => lines.push(`- ${s.name}${s.desc ? ' — ' + s.desc.slice(0, 120) : ''}`));
    lines.push('');
  }
  if (m.innovative.length) {
    lines.push('INNOVATIVE THIS WEEK');
    m.innovative.forEach((s) => lines.push(`- ${s.name} (@${s.handle || 'unknown'})${s.desc ? ' — ' + s.desc.slice(0, 120) : ''}`));
    lines.push('');
  }
  lines.push(m.newSection.title.toUpperCase());
  m.newSection.items.forEach((s) => lines.push(`- ${s.name} (@${s.handle || 'unknown'})`));
  lines.push('');
  lines.push('BY THE NUMBERS', m.categories.map(([c, n]) => `${c} ${n}`).join(' · '), '');
  lines.push('Browse: https://skills.dmzagent.com/browse');
  return lines.join('\n');
}

export function buildModel({ skills, error }, cfg = CFG, now = Date.now()) {
  const base = { issueNo: Math.max(1, Math.floor((now - cfg.issueEpoch) / (7 * 86400000)) + 1), dateLabel: new Date(now).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) };
  if (error && skills.length === 0) {
    return { ...base, notice: `This week's digest couldn't be generated: the skill registry was unreachable (${error}). It will try again next week — or re-run the digest task manually.` };
  }
  if (skills.length === 0) {
    return { ...base, notice: 'No skills are published in the registry yet. Once skills land, this digest will highlight the most popular and innovative ones.' };
  }
  return analyze(skills, cfg, now);
}

function subjectFor(m) {
  const d = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (m.notice) return `\u{1F6E0} The Skill Forge — Weekly Digest (${d}) — service notice`;
  return `\u{1F6E0} The Skill Forge — Weekly Digest (${d})`;
}

// ---------------------------------------------------------------------------
// Delivery (Resend HTTP API)
// ---------------------------------------------------------------------------

const MAIL = {
  to: process.env.MAIL_TO || 'matt@eastern-shore-solutions.com',
  // The From address MUST be on the domain you verified in Resend (skills.dmzagent.com).
  from: process.env.MAIL_FROM || 'The Skill Forge <forge@skills.dmzagent.com>',
  apiKey: process.env.RESEND_API_KEY || '',
};

// POST the rendered email to Resend; resolves to the Resend message id.
// https://resend.com/docs/api-reference/emails/send-email
async function sendViaResend({ subject, html, text, to, from }, apiKey, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error?.message || `Resend HTTP ${res.status}`);
    return body?.id || null;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const wantSend = args.has('--send');
  const dryRun = args.has('--dry-run');

  const loaded = await loadSkills(CFG);
  const model = buildModel(loaded, CFG);
  const html = renderHtml(model);
  const text = renderText(model);
  const subject = subjectFor(model);

  fs.mkdirSync(CFG.outDir, { recursive: true });
  const htmlPath = path.join(CFG.outDir, 'skill-digest.html');
  const txtPath = path.join(CFG.outDir, 'skill-digest.txt');
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(txtPath, text);

  // Delivery. No flag -> just write files (legacy behavior).
  //   --dry-run -> never calls the API; reports what would be sent.
  //   --send    -> delivers via Resend when RESEND_API_KEY is present;
  //                if the key is missing it is a safe no-op (sent:false).
  let sent = false;
  let resendId = null;
  let sendError = null;
  if (dryRun) {
    sendError = 'dry-run: not sent';
  } else if (wantSend) {
    if (!MAIL.apiKey) {
      sendError = 'RESEND_API_KEY not set';
    } else {
      try {
        resendId = await sendViaResend({ subject, html, text, to: MAIL.to, from: MAIL.from }, MAIL.apiKey);
        sent = true;
      } catch (e) {
        sendError = e.message || String(e);
      }
    }
  }

  const summary = {
    subject,
    htmlPath,
    txtPath,
    to: MAIL.to,
    from: MAIL.from,
    issueNo: model.issueNo,
    notice: !!model.notice,
    total: model.total ?? 0,
    fetchError: loaded.error || null,
    sent,
    resendId,
    sendError,
  };
  console.log(JSON.stringify(summary));
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('digest failed:', e); process.exit(1); });
}
