/**
 * Install-planning and file-writing logic, adapted from the skill-builder CLI
 * (packages/cli/src/install.ts). Differences from the CLI:
 *  - every path resolves under an explicit `projectDir` (the MCP server's cwd
 *    is not necessarily the user's project), and
 *  - `writeSkillForTool` returns a structured result (path + status) instead of
 *    pretty log lines, and supports a dry run.
 */

import * as fs from "fs";
import * as path from "path";
import type { InstallTarget, Skill } from "./types.js";
import type { RegistryClient } from "./registry-client.js";

export type InstallPlan = {
  /** The skill the user asked to install. */
  root: Skill;
  /** Deduped (transitive) dependencies, in install order (deepest first). */
  deps: Skill[];
  /** Dependency ids that could not be fetched from the registry. */
  missing: string[];
};

/** A skill is effectively `meta` if it declares any dependencies. */
export function effectiveType(skill: Pick<Skill, "type" | "dependencies">): "basic" | "meta" {
  return skill.type ?? (skill.dependencies?.length ? "meta" : "basic");
}

/** Human-friendly id (`@handle/skill` if known, else the bare id). */
export function displayId(skill: Skill): string {
  if (skill.id.startsWith("@")) return skill.id;
  return skill.authorHandle ? `@${skill.authorHandle}/${skill.id}` : skill.id;
}

/**
 * Resolve the full install set for a skill: the skill itself plus every
 * (transitive) dependency, deduped and cycle-safe. Dependencies are returned in
 * an order where a skill's own dependencies come before it, so writing `deps`
 * then `root` lands prerequisites first.
 *
 * NOTE: this calls `client.getSkill` for the root and each dependency, which
 * increments their download counters — correct for an install.
 */
export async function resolveInstallPlan(
  client: RegistryClient,
  rootId: string,
): Promise<InstallPlan> {
  const root = (await client.getSkill(rootId)).skill;
  const resolved = new Map<string, Skill>([[root.id, root]]);
  const visited = new Set<string>([root.id]);
  const missing: string[] = [];

  // Breadth-first walk of the dependency graph.
  const queue: string[] = [...(root.dependencies ?? [])];
  while (queue.length > 0) {
    const depId = queue.shift()!;
    if (visited.has(depId)) continue;
    visited.add(depId);
    try {
      const dep = (await client.getSkill(depId)).skill;
      resolved.set(dep.id, dep);
      for (const next of dep.dependencies ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    } catch {
      missing.push(depId);
    }
  }

  // Topological-ish ordering: a node after all of its dependencies. Falls back
  // to insertion order if a cycle is present (already deduped, so still safe).
  const order: Skill[] = [];
  const placed = new Set<string>();
  const place = (skill: Skill, stack: Set<string>) => {
    if (placed.has(skill.id) || stack.has(skill.id)) return;
    stack.add(skill.id);
    for (const depId of skill.dependencies ?? []) {
      const dep = resolved.get(depId);
      if (dep && dep.id !== skill.id) place(dep, stack);
    }
    stack.delete(skill.id);
    if (!placed.has(skill.id)) {
      placed.add(skill.id);
      order.push(skill);
    }
  };
  for (const skill of resolved.values()) place(skill, new Set());

  const deps = order.filter((s) => s.id !== root.id);
  return { root, deps, missing };
}

export type WriteOptions = {
  target: InstallTarget;
  /** Absolute path to the project root that files are written under. */
  projectDir: string;
  /** Output directory for `file` target, relative to projectDir (default "."). */
  outputDir: string;
  /** Path to the AGENTS.md/CLAUDE.md file for claude/codex, relative to projectDir. */
  agentsFile: string;
  /** When true, compute paths and report actions but write nothing. */
  dryRun: boolean;
};

export type WriteResult = {
  skillId: string;
  name: string;
  /** "written" | "skipped" (already present) | "planned" (dry run). */
  status: "written" | "skipped" | "planned";
  /** Files that were (or would be) written, as absolute paths. */
  files: string[];
  detail: string;
};

function bareFileName(skill: Skill): string {
  return skill.id.startsWith("@") ? skill.id.slice(skill.id.indexOf("/") + 1) : skill.id;
}

function ensureDir(dir: string, dryRun: boolean): void {
  if (dryRun) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write a single skill for the target tool. Mirrors the per-tool behavior of
 * the CLI install, resolving every path against `opts.projectDir`.
 */
export function writeSkillForTool(skill: Skill, opts: WriteOptions): WriteResult {
  const fileName = bareFileName(skill);
  const resolve = (p: string) => path.resolve(opts.projectDir, p);

  switch (opts.target) {
    case "claude":
    case "codex": {
      const filePath = resolve(opts.agentsFile);
      const heading = `## ${skill.name}`;
      const description = skill.description ? `> ${skill.description}\n` : "";
      const marker = `<!-- skill-id: ${skill.id} -->`;
      const preamble = `\n\n${heading}\n${description}\n${marker}\n`;

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, "utf-8");
        if (existing.includes(marker)) {
          return {
            skillId: skill.id,
            name: skill.name,
            status: "skipped",
            files: [filePath],
            detail: `already present in ${filePath}`,
          };
        }
      }

      if (!opts.dryRun) {
        ensureDir(path.dirname(filePath), false);
        if (fs.existsSync(filePath)) {
          fs.appendFileSync(filePath, preamble + skill.markdown, "utf-8");
        } else {
          fs.writeFileSync(filePath, preamble + skill.markdown, "utf-8");
        }
      }
      return {
        skillId: skill.id,
        name: skill.name,
        status: opts.dryRun ? "planned" : "written",
        files: [filePath],
        detail: `${opts.dryRun ? "would append" : "appended"} to ${filePath}`,
      };
    }

    case "cursor": {
      const rulesDir = resolve(".cursor/rules");
      const mdcPath = path.join(rulesDir, `${fileName}.mdc`);
      const frontmatter = [
        "---",
        `description: ${skill.description || skill.name}`,
        "globs: *",
        "---",
        "",
      ].join("\n");
      if (!opts.dryRun) {
        ensureDir(rulesDir, false);
        fs.writeFileSync(mdcPath, frontmatter + skill.markdown, "utf-8");
      }
      return {
        skillId: skill.id,
        name: skill.name,
        status: opts.dryRun ? "planned" : "written",
        files: [mdcPath],
        detail: `${opts.dryRun ? "would write" : "wrote"} ${mdcPath}`,
      };
    }

    default: {
      const outDir = resolve(opts.outputDir);
      const outPath = path.join(outDir, `${fileName}.md`);
      const configPath = path.join(outDir, `${fileName}.json`);
      const config = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        type: effectiveType(skill),
        dependencies: skill.dependencies ?? [],
        version: skill.version,
        author: skill.author,
      };
      if (!opts.dryRun) {
        ensureDir(outDir, false);
        fs.writeFileSync(outPath, skill.markdown, "utf-8");
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
      }
      return {
        skillId: skill.id,
        name: skill.name,
        status: opts.dryRun ? "planned" : "written",
        files: [outPath, configPath],
        detail: `${opts.dryRun ? "would write" : "wrote"} ${outPath} (+ ${path.basename(configPath)})`,
      };
    }
  }
}
