import * as fs from 'fs';
import * as path from 'path';
import type { ApiClient, Skill } from './api/client.js';

export type InstallPlan = {
  /** The skill the user asked to install. */
  root: Skill;
  /** Deduped dependencies (transitive), in install order (deepest first). */
  deps: Skill[];
  /** Dependency ids that could not be fetched from the registry. */
  missing: string[];
};

/**
 * Resolve the full install set for a meta skill: the skill itself plus every
 * (transitive) dependency, deduped and cycle-safe. Dependencies are returned in
 * an order where a skill's own dependencies come before it, so writing `deps`
 * then `root` lands prerequisites first.
 */
export async function resolveInstallPlan(client: ApiClient, rootId: string): Promise<InstallPlan> {
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
  tool: string;
  outputDir: string;
  agentsFile: string;
};

function bareFileName(skill: Skill): string {
  return skill.id.startsWith('@') ? skill.id.slice(skill.id.indexOf('/') + 1) : skill.id;
}

/**
 * Write a single skill to the target tool. Returns log lines describing what was
 * written (or skipped). Mirrors the per-tool behavior of the original install.
 */
export function writeSkillForTool(skill: Skill, opts: WriteOptions): string[] {
  const fileName = bareFileName(skill);
  const log: string[] = [];

  switch (opts.tool) {
    case 'claude':
    case 'codex': {
      const filePath = path.resolve(opts.agentsFile);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const heading = `## ${skill.name}`;
      const description = skill.description ? `> ${skill.description}\n` : '';
      const preamble = `\n\n${heading}\n${description}\n<!-- skill-id: ${skill.id} -->\n`;

      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf-8');
        if (existing.includes(`<!-- skill-id: ${skill.id} -->`)) {
          log.push(`  • ${skill.name} already present in ${filePath}`);
          return log;
        }
        fs.appendFileSync(filePath, preamble + skill.markdown, 'utf-8');
      } else {
        fs.writeFileSync(filePath, preamble + skill.markdown, 'utf-8');
      }
      log.push(`  ✓ ${skill.name} → ${filePath}`);
      break;
    }

    case 'cursor': {
      const rulesDir = path.resolve('.cursor/rules');
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

      const mdcPath = path.join(rulesDir, `${fileName}.mdc`);
      const frontmatter = ['---', `description: ${skill.description || skill.name}`, 'globs: *', '---', ''].join('\n');
      fs.writeFileSync(mdcPath, frontmatter + skill.markdown, 'utf-8');
      log.push(`  ✓ ${skill.name} → ${mdcPath}`);
      break;
    }

    default: {
      const outDir = path.resolve(opts.outputDir);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const outPath = path.join(outDir, `${fileName}.md`);
      fs.writeFileSync(outPath, skill.markdown, 'utf-8');

      const configPath = path.join(outDir, `${fileName}.json`);
      const config = {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        tags: skill.tags,
        type: skill.type ?? (skill.dependencies?.length ? 'meta' : 'basic'),
        dependencies: skill.dependencies ?? [],
        version: skill.version,
        author: skill.author,
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      log.push(`  ✓ ${skill.name} → ${outPath} (+ ${path.basename(configPath)})`);
      break;
    }
  }

  return log;
}
