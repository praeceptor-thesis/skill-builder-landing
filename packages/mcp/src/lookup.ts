/**
 * Read-only skill lookup. Unlike `RegistryClient.getSkill`, this does NOT
 * increment the skill's download counter — it resolves a skill by id or name
 * through the search/list endpoint, which is side-effect free. Use it for
 * previews (`skill_info`); use `getSkill`/`resolveInstallPlan` for installs.
 */

import type { RegistryClient } from "./registry-client.js";
import type { Skill } from "./types.js";

/** Strip a leading `@handle/` and a leading `@` to get the bare slug. */
export function bareId(idOrName: string): string {
  if (idOrName.startsWith("@")) {
    const slash = idOrName.indexOf("/");
    return slash >= 0 ? idOrName.slice(slash + 1) : idOrName.slice(1);
  }
  return idOrName;
}

function matches(skill: Skill, needle: string): boolean {
  const n = needle.toLowerCase();
  const candidates = [
    skill.id.toLowerCase(),
    bareId(skill.id).toLowerCase(),
    skill.name.toLowerCase(),
  ];
  if (skill.authorHandle) {
    candidates.push(`@${skill.authorHandle}/${bareId(skill.id)}`.toLowerCase());
  }
  return candidates.includes(n);
}

/**
 * Find a single skill by id or name without counting a download. Returns the
 * exact match if one exists, otherwise the most relevant result, otherwise
 * `null` if nothing matches.
 */
export async function findSkill(
  client: RegistryClient,
  idOrName: string,
): Promise<Skill | null> {
  const term = idOrName.trim();
  const { skills } = await client.listSkills({
    query: bareId(term),
    sort: "relevant",
    pageSize: 50,
  });

  if (skills.length === 0) {
    // Fall back to an unfiltered relevance search on the raw input.
    const fallback = await client.listSkills({ query: term, pageSize: 50 });
    const exact = fallback.skills.find((s) => matches(s, term));
    return exact ?? fallback.skills[0] ?? null;
  }

  const exact = skills.find((s) => matches(s, term));
  return exact ?? skills[0];
}
