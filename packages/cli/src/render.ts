import type { Skill, SkillSuggestion } from './api/client.js';

/** Display id: scoped (`@handle/id`) when we know the handle, otherwise raw. */
export function displayId(skill: Pick<Skill, 'id' | 'authorHandle'>): string {
  if (skill.id.startsWith('@')) return skill.id;
  return skill.authorHandle ? `@${skill.authorHandle}/${skill.id}` : skill.id;
}

/** A skill is `meta` if it declares dependencies, else honor its explicit type. */
export function effectiveType(skill: Pick<Skill, 'type' | 'dependencies'>): 'basic' | 'meta' {
  if (skill.dependencies && skill.dependencies.length > 0) return 'meta';
  return skill.type === 'meta' ? 'meta' : 'basic';
}

export function truncate(value: string, max: number): string {
  const v = (value || '').replace(/\s+/g, ' ').trim();
  if (v.length <= max) return v;
  return v.slice(0, Math.max(0, max - 1)) + '…';
}

type Column<T> = { header: string; get: (row: T) => string; align?: 'left' | 'right' };

function renderTable<T>(rows: T[], columns: Column<T>[]): string {
  const cells = rows.map((row) => columns.map((c) => c.get(row) ?? ''));
  const widths = columns.map((c, i) => Math.max(c.header.length, ...cells.map((r) => r[i].length), 0));
  const pad = (text: string, width: number, align?: 'left' | 'right') =>
    align === 'right' ? text.padStart(width) : text.padEnd(width);

  const headerLine = columns.map((c, i) => pad(c.header, widths[i], c.align)).join('  ');
  const ruleLine = widths.map((w) => '─'.repeat(w)).join('  ');
  const bodyLines = cells.map((r) => r.map((text, i) => pad(text, widths[i], columns[i].align)).join('  '));
  return [headerLine, ruleLine, ...bodyLines].join('\n');
}

/** A dense, aligned table of skills for `list` / `search`. */
export function renderSkillTable(skills: Skill[]): string {
  if (skills.length === 0) return 'No skills found.';
  return renderTable<Skill>(skills, [
    { header: 'ID', get: (s) => truncate(displayId(s), 34) },
    { header: 'NAME', get: (s) => truncate(s.name, 28) },
    { header: 'CATEGORY', get: (s) => truncate(s.category || '', 16) },
    { header: 'TYPE', get: (s) => effectiveType(s) },
    { header: 'DEPS', get: (s) => String((s.dependencies || []).length || ''), align: 'right' },
    { header: '↓', get: (s) => String(s.downloads ?? 0), align: 'right' },
  ]);
}

/** Full single-skill view for `info`. */
export function renderSkillInfo(skill: Skill): string {
  const lines: string[] = [];
  const type = effectiveType(skill);
  lines.push(`${skill.name}  (${displayId(skill)})`);
  lines.push('');
  if (skill.description) lines.push(skill.description, '');

  const meta: Array<[string, string]> = [
    ['Type', type === 'meta' ? 'meta (installs dependencies)' : 'basic'],
    ['Category', skill.category || '—'],
    ['Author', skill.author?.name ? `${skill.author.name}${skill.authorHandle ? ` (@${skill.authorHandle})` : ''}` : (skill.authorHandle ? `@${skill.authorHandle}` : '—')],
    ['Version', `v${skill.version ?? 1}`],
    ['Downloads', String(skill.downloads ?? 0)],
  ];
  if (skill.tags && skill.tags.length) meta.push(['Tags', skill.tags.join(', ')]);
  if (skill.forkedFrom) meta.push(['Forked from', skill.forkedFrom]);
  const labelWidth = Math.max(...meta.map(([l]) => l.length));
  for (const [label, value] of meta) lines.push(`${label.padEnd(labelWidth)}  ${value}`);

  if (skill.dependencies && skill.dependencies.length) {
    lines.push('', `Dependencies (${skill.dependencies.length}) — installed automatically:`);
    for (const dep of skill.dependencies) lines.push(`  - ${dep}`);
  }

  if (skill.spec?.instructions?.length) {
    lines.push('', `Instructions (${skill.spec.instructions.length}):`);
    skill.spec.instructions.slice(0, 8).forEach((step, i) => lines.push(`  ${i + 1}. ${truncate(step, 100)}`));
    if (skill.spec.instructions.length > 8) lines.push(`  … and ${skill.spec.instructions.length - 8} more`);
  }

  return lines.join('\n');
}

export function renderSuggestions(suggestions: SkillSuggestion[]): string {
  if (suggestions.length === 0) return 'No matches.';
  return suggestions
    .map((s) => {
      switch (s.kind) {
        case 'skill': {
          const tags = [s.type, s.dependencies ? `${s.dependencies} deps` : '', s.category]
            .filter(Boolean)
            .join(', ');
          return `  skill     ${s.value}  — ${s.label}${tags ? ` (${tags})` : ''}`;
        }
        case 'tag':
          return `  tag       ${s.value}${s.count ? `  (${s.count})` : ''}`;
        case 'author':
          return `  author    @${s.value}  — ${s.label}`;
        case 'category':
          return `  category  ${s.value}`;
        default:
          return `  ${s.value}`;
      }
    })
    .join('\n');
}
