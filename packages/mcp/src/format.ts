/** Output formatting helpers shared across tools (markdown + truncation). */

import { CHARACTER_LIMIT, WEB_BASE_URL } from "./constants.js";
import { effectiveType, displayId } from "./install.js";
import type { SkillSuggestion, Skill } from "./types.js";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Public web URL for a skill detail page. */
export function skillUrl(skill: Pick<Skill, "id">): string {
  return `${WEB_BASE_URL}/skills/${encodeURIComponent(skill.id)}`;
}

/** Truncate a string to CHARACTER_LIMIT with a trailing note. */
export function clampText(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n…[truncated ${text.length - CHARACTER_LIMIT} characters. Narrow your query, ` +
    `lower pageSize, or fetch a single skill with skill_info.]`
  );
}

/** One compact line summarizing a skill, for list/search output. */
export function skillLine(skill: Skill): string {
  const type = effectiveType(skill);
  const tags = skill.tags?.length ? ` · ${skill.tags.slice(0, 4).join(", ")}` : "";
  const meta = type === "meta" ? ` · meta(${skill.dependencies?.length ?? 0} deps)` : "";
  return (
    `- **${displayId(skill)}** — ${skill.description || skill.name}\n` +
    `  ${skill.category || "Uncategorized"} · ${skill.downloads ?? 0} downloads${meta}${tags}`
  );
}

/** Render a list of skills as a markdown summary. */
export function formatSkillList(
  skills: Skill[],
  meta: { total: number; page: number; pageSize: number },
): string {
  if (skills.length === 0) return "No skills matched. Try broader terms or `skill_suggest`.";
  const header =
    `Found ${meta.total} skill${meta.total === 1 ? "" : "s"} ` +
    `(page ${meta.page}, showing ${skills.length}):`;
  return [header, "", ...skills.map(skillLine)].join("\n");
}

/** Render the full detail of a single skill, including its markdown body. */
export function formatSkillInfo(skill: Skill): string {
  const type = effectiveType(skill);
  const lines: string[] = [
    `# ${skill.name}`,
    "",
    `- **id**: ${displayId(skill)}`,
    `- **type**: ${type}`,
    `- **category**: ${skill.category || "Uncategorized"}`,
  ];
  if (skill.tags?.length) lines.push(`- **tags**: ${skill.tags.join(", ")}`);
  if (skill.authorHandle || skill.author?.name) {
    lines.push(`- **author**: ${skill.author?.name ?? ""} ${skill.authorHandle ? `(@${skill.authorHandle})` : ""}`.trim());
  }
  lines.push(`- **version**: ${skill.version} · **downloads**: ${skill.downloads ?? 0}`);
  if (type === "meta" && skill.dependencies?.length) {
    lines.push("", "**Dependencies** (installed automatically with this meta skill):");
    for (const dep of skill.dependencies) lines.push(`- ${dep}`);
  }
  lines.push("", `Web: ${skillUrl(skill)}`);
  if (skill.description) lines.push("", `> ${skill.description}`);
  lines.push("", "---", "", skill.markdown || "_(no markdown body)_");
  return lines.join("\n");
}

/** Render autocomplete suggestions grouped by kind. */
export function formatSuggestions(suggestions: SkillSuggestion[]): string {
  if (suggestions.length === 0) return "No suggestions.";
  return suggestions
    .map((s) => {
      const extra =
        s.kind === "skill"
          ? ` (${s.type ?? "basic"}${s.downloads != null ? `, ${s.downloads} downloads` : ""})`
          : s.count != null
            ? ` (${s.count})`
            : "";
      return `- [${s.kind}] ${s.label || s.value}${extra}`;
    })
    .join("\n");
}
