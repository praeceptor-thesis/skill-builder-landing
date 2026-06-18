/**
 * Resolve where and how to install: the project directory and the target
 * coding tool. The MCP server's own cwd is not guaranteed to be the user's
 * project, so callers may pass `project_dir` explicitly; otherwise we use
 * SKILL_PROJECT_DIR or process.cwd().
 */

import * as fs from "fs";
import * as path from "path";
import type { InstallTarget } from "./types.js";

export function resolveProjectDir(explicit?: string): string {
  const dir = explicit || process.env.SKILL_PROJECT_DIR || process.cwd();
  return path.resolve(dir);
}

const VALID_TARGETS: InstallTarget[] = ["claude", "codex", "cursor", "file"];

function isTarget(value: string): value is InstallTarget {
  return (VALID_TARGETS as string[]).includes(value);
}

/**
 * Resolve the install target. If `requested` is a concrete target, it wins.
 * For "auto" (or undefined) we check SKILL_TARGET, then sniff the project
 * directory and environment for tell-tale config, falling back to "file".
 */
export function resolveTarget(requested: string | undefined, projectDir: string): InstallTarget {
  if (requested && requested !== "auto") {
    if (isTarget(requested)) return requested;
  }

  const envTarget = process.env.SKILL_TARGET?.toLowerCase();
  if (envTarget && isTarget(envTarget)) return envTarget;

  const has = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  if (has(".cursor")) return "cursor";
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE || has(".claude") || has("CLAUDE.md")) {
    return "claude";
  }
  if (has("AGENTS.md")) return "codex";
  return "file";
}

/** Default agents/instructions file for a target, relative to the project. */
export function defaultAgentsFile(target: InstallTarget): string {
  return target === "claude" ? "CLAUDE.md" : "AGENTS.md";
}
