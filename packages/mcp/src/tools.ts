/**
 * Tool definitions for the skill-builder MCP server. One domain (the registry),
 * five tools: four read-only discovery tools and one install tool that writes
 * skill files into the user's project and resolves meta-skill dependency trees.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { RegistryClient, RegistryError } from "./registry-client.js";
import { findSkill } from "./lookup.js";
import { resolveInstallPlan, writeSkillForTool, effectiveType, displayId } from "./install.js";
import { resolveProjectDir, resolveTarget, defaultAgentsFile } from "./detect.js";
import {
  ResponseFormat,
  clampText,
  formatSkillList,
  formatSkillInfo,
  formatSuggestions,
  skillUrl,
} from "./format.js";
import type { RegistrySearchParams, Skill } from "./types.js";

export type ServerConfig = {
  client: RegistryClient;
  apiUrl: string;
};

/* --------------------------------- helpers -------------------------------- */

const responseFormatField = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' (human-readable, default) or 'json' (full structured records).");

function textResult(text: string, structured?: Record<string, unknown>): CallToolResult {
  const result: CallToolResult = { content: [{ type: "text", text: clampText(text) }] };
  if (structured) result.structuredContent = structured;
  return result;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Turn any thrown value into a friendly, actionable error message. */
function describeError(error: unknown): string {
  if (error instanceof RegistryError) {
    switch (error.code) {
      case "NETWORK_ERROR":
      case "TIMEOUT":
        return `${error.message}. Check your connection and the SKILL_API_URL setting.`;
      case "NON_JSON_RESPONSE":
        return `${error.message} If you are behind Cloudflare, a Bot Fight Mode / WAF rule may be blocking the registry.`;
      case "AUTH_REQUIRED":
      case "AUTH_INVALID_TOKEN":
        return `${error.message}. Set a valid SKILL_TOKEN (only needed for private/draft skills).`;
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Compact summary of a skill for structured output. */
function skillSummary(skill: Skill) {
  return {
    id: skill.id,
    displayId: displayId(skill),
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags ?? [],
    type: effectiveType(skill),
    dependencies: skill.dependencies ?? [],
    downloads: skill.downloads ?? 0,
    version: skill.version,
    authorHandle: skill.authorHandle,
    url: skillUrl(skill),
  };
}

/* ---------------------------------- tools --------------------------------- */

export function registerTools(server: McpServer, config: ServerConfig): void {
  const { client } = config;

  // -- skill_search ---------------------------------------------------------
  server.registerTool(
    "skill_search",
    {
      title: "Search the skill registry",
      description: `Search and browse the skill-builder registry of reusable AI skill prompts.

Use this first to discover what skills exist before installing. Supports free-text
search plus filters and sorting. Read-only; never writes files.

Args:
  - query (string, optional): free-text search across names, descriptions, tags.
  - category (string, optional): exact category filter (e.g. "Developer Tools").
  - author (string, optional): publisher handle (with or without leading @).
  - tags (string[], optional): require these tags.
  - type ('basic' | 'meta', optional): 'meta' = skills that orchestrate dependencies.
  - sort ('relevant' | 'recent' | 'popular' | 'downloads'): default 'relevant' when a
    query is given, otherwise 'recent'.
  - page (number): 1-based page (default 1).
  - page_size (number): results per page, 1-100 (default 20).
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: a list of matching skills (id, name, description, category, type,
dependency count, downloads). JSON format additionally returns total/page/pageSize.

Example: skill_search { "query": "data pipeline", "type": "meta" }
To install one of the results, call skill_install with its id.`,
      inputSchema: {
        query: z.string().max(200).optional().describe("Free-text search query."),
        category: z.string().max(120).optional().describe("Exact category filter."),
        author: z.string().max(120).optional().describe("Publisher handle (with or without @)."),
        tags: z.array(z.string()).max(10).optional().describe("Require these tags."),
        type: z.enum(["basic", "meta"]).optional().describe("Filter by skill type."),
        sort: z
          .enum(["relevant", "recent", "popular", "downloads"])
          .optional()
          .describe("Sort order. Defaults to 'relevant' with a query, else 'recent'."),
        page: z.number().int().min(1).default(1).describe("1-based page number."),
        page_size: z.number().int().min(1).max(100).default(20).describe("Results per page (1-100)."),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const params: RegistrySearchParams = {
          query: args.query,
          category: args.category,
          author: args.author,
          tags: args.tags,
          type: args.type,
          sort: args.sort,
          page: args.page,
          pageSize: args.page_size,
        };
        const res = await client.listSkills(params);
        const structured = {
          total: res.total,
          page: res.page,
          pageSize: res.pageSize,
          count: res.skills.length,
          skills: res.skills.map(skillSummary),
        };
        if (args.response_format === ResponseFormat.JSON) {
          return textResult(JSON.stringify(structured, null, 2), structured);
        }
        return textResult(
          formatSkillList(res.skills, { total: res.total, page: res.page, pageSize: res.pageSize }),
          structured,
        );
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  // -- skill_info -----------------------------------------------------------
  server.registerTool(
    "skill_info",
    {
      title: "Get full details of a skill",
      description: `Fetch the complete record for one skill: metadata plus the full markdown body
(the actual prompt/instructions). Resolves by id or name. Read-only — unlike an
install, this does NOT count as a download.

Args:
  - skill (string): skill id ("@handle/slug" or bare "slug") or its display name.
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: name, id, type, category, tags, author, version, downloads, dependency
list (for meta skills), the web URL, and the full markdown body. JSON format
returns the raw skill record.

Example: skill_info { "skill": "@kmd_ai/bakefail-pre-flight-auditor" }
If you intend to use the skill in this project, follow up with skill_install.`,
      inputSchema: {
        skill: z.string().min(1).describe("Skill id ('@handle/slug' or 'slug') or display name."),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const skill = await findSkill(client, args.skill);
        if (!skill) {
          return errorResult(
            `No skill found matching "${args.skill}". Use skill_search or skill_suggest to find the right id.`,
          );
        }
        const structured = { skill };
        if (args.response_format === ResponseFormat.JSON) {
          return textResult(JSON.stringify(structured, null, 2), structured);
        }
        return textResult(formatSkillInfo(skill), { skill: skillSummary(skill) });
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  // -- skill_suggest --------------------------------------------------------
  server.registerTool(
    "skill_suggest",
    {
      title: "Autocomplete skills, tags, authors",
      description: `Autocomplete/typeahead over the registry: returns matching skills, tags,
authors, and categories for a (possibly partial) query. Useful for resolving a
vague request to a concrete skill id before calling skill_info or skill_install.
Read-only.

Args:
  - query (string): partial term to complete (min 1 char).
  - limit (number): max suggestions, 1-25 (default 10).

Returns: a ranked list of suggestions, each tagged with its kind
(skill | tag | author | category).

Example: skill_suggest { "query": "lit" }`,
      inputSchema: {
        query: z.string().min(1).max(100).describe("Partial term to autocomplete."),
        limit: z.number().int().min(1).max(25).default(10).describe("Max suggestions (1-25)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const { suggestions } = await client.suggest(args.query, args.limit);
        return textResult(formatSuggestions(suggestions), { suggestions });
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  // -- skill_taxonomy -------------------------------------------------------
  server.registerTool(
    "skill_taxonomy",
    {
      title: "List registry categories, tags, authors",
      description: `Get the registry's taxonomy: the full set of categories, tags, authors, and
types with counts, plus the total number of skills. Use it to discover valid
filter values for skill_search. Read-only.

Args:
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: total skill count and faceted lists of categories, types, authors, and
tags, each with a count.`,
      inputSchema: {
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const tax = await client.getTaxonomy();
        if (args.response_format === ResponseFormat.JSON) {
          return textResult(JSON.stringify(tax, null, 2), tax as unknown as Record<string, unknown>);
        }
        const facet = (label: string, items: { value: string; count: number }[]) =>
          items.length
            ? `\n**${label}**\n` + items.map((i) => `- ${i.value} (${i.count})`).join("\n")
            : "";
        const text =
          `Registry contains ${tax.total} skill${tax.total === 1 ? "" : "s"}.\n` +
          facet("Categories", tax.categories) +
          facet("Types", tax.types) +
          facet("Authors", tax.authors) +
          facet("Tags", tax.tags);
        return textResult(text, tax as unknown as Record<string, unknown>);
      } catch (error) {
        return errorResult(describeError(error));
      }
    },
  );

  // -- skill_install --------------------------------------------------------
  server.registerTool(
    "skill_install",
    {
      title: "Install a skill into the project",
      description: `Install a skill from the registry into the current project, writing the files
the target coding tool expects. If the skill is a META skill, its full
dependency tree is resolved (deduped, cycle-safe) and every required skill is
installed alongside it (pass with_dependencies=false to install only the meta
skill itself).

Where files are written, by target:
  - claude: appends the skill markdown to CLAUDE.md (under a "## <name>" heading
    with a hidden skill-id marker; re-installs are skipped if already present).
  - codex: same, but to AGENTS.md.
  - cursor: writes .cursor/rules/<slug>.mdc with frontmatter.
  - file: writes <slug>.md plus a <slug>.json manifest into output_dir.

Args:
  - skill (string): id ("@handle/slug" or "slug") of the skill to install.
  - target ('auto' | 'claude' | 'codex' | 'cursor' | 'file'): default 'auto',
    which sniffs the project (.cursor/, .claude/, CLAUDE.md, AGENTS.md, env) and
    falls back to 'file'.
  - project_dir (string, optional): project root to install into. Defaults to
    SKILL_PROJECT_DIR or the server's working directory.
  - output_dir (string, optional): for target 'file', dir relative to project_dir
    (default ".").
  - agents_file (string, optional): override the CLAUDE.md / AGENTS.md path
    (relative to project_dir) for targets 'claude'/'codex'.
  - with_dependencies (boolean): install a meta skill's dependencies too (default true).
  - dry_run (boolean): plan and report what would be written without writing (default false).
  - response_format ('markdown' | 'json'): default 'markdown'.

Returns: the resolved target and project dir, the ordered install plan, and the
files written/planned for each skill, plus any dependencies that could not be
resolved. This tool WRITES FILES (non-read-only). It never deletes anything.

Example: skill_install { "skill": "@kmd_ai/paperdistillery-orchestrated-literature-to-briefing-pipeline" }`,
      inputSchema: {
        skill: z.string().min(1).describe("Skill id to install ('@handle/slug' or 'slug')."),
        target: z
          .enum(["auto", "claude", "codex", "cursor", "file"])
          .default("auto")
          .describe("Target coding tool. 'auto' detects from the project."),
        project_dir: z.string().optional().describe("Project root to install into."),
        output_dir: z.string().default(".").describe("Output dir for target 'file' (relative to project_dir)."),
        agents_file: z.string().optional().describe("Override CLAUDE.md/AGENTS.md path for claude/codex."),
        with_dependencies: z.boolean().default(true).describe("Install a meta skill's dependencies too."),
        dry_run: z.boolean().default(false).describe("Report what would be written without writing."),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      const projectDir = resolveProjectDir(args.project_dir);
      const target = resolveTarget(args.target, projectDir);
      const agentsFile = args.agents_file ?? defaultAgentsFile(target);

      // Resolve + plan. Try the raw input first (the Worker normalizes bare ids
      // and ids under a handle); on a not-found, offer suggestions.
      let plan;
      try {
        plan = await resolveInstallPlan(client, args.skill);
      } catch (error) {
        if (
          error instanceof RegistryError &&
          (error.code === "SKILL_NOT_FOUND" || error.code === "NOT_FOUND" || error.status === 404)
        ) {
          let hint = "";
          try {
            const { suggestions } = await client.suggest(args.skill, 5);
            const skillHits = suggestions.filter((s) => s.kind === "skill");
            if (skillHits.length) {
              hint = " Did you mean: " + skillHits.map((s) => s.value).join(", ") + "?";
            }
          } catch {
            /* suggestions are best-effort */
          }
          return errorResult(
            `No skill found for "${args.skill}".${hint} Use skill_search to find the exact id.`,
          );
        }
        return errorResult(describeError(error));
      }

      const isMeta = effectiveType(plan.root) === "meta";
      const withDeps = args.with_dependencies;
      const toInstall = withDeps ? [...plan.deps, plan.root] : [plan.root];

      const results = toInstall.map((skill) =>
        writeSkillForTool(skill, {
          target,
          projectDir,
          outputDir: args.output_dir,
          agentsFile,
          dryRun: args.dry_run,
        }),
      );

      const structured = {
        skill: displayId(plan.root),
        type: effectiveType(plan.root),
        target,
        projectDir,
        dryRun: args.dry_run,
        installed: results,
        missingDependencies: plan.missing,
        planOrder: toInstall.map((s) => displayId(s)),
      };

      if (args.response_format === ResponseFormat.JSON) {
        return textResult(JSON.stringify(structured, null, 2), structured);
      }

      const lines: string[] = [];
      lines.push(
        `${args.dry_run ? "Dry run — would install" : "Installed"} ${displayId(plan.root)}` +
          ` (${effectiveType(plan.root)}) for target "${target}" in ${projectDir}`,
      );
      if (isMeta) {
        lines.push(
          withDeps
            ? `Meta skill: ${plan.deps.length} dependency(ies) included.`
            : `Meta skill: dependencies skipped (with_dependencies=false).`,
        );
      }
      lines.push("");
      for (const r of results) {
        const mark = r.status === "skipped" ? "•" : r.status === "planned" ? "→" : "✓";
        lines.push(`${mark} ${displayId(plan.root) === r.skillId ? r.name + " (root)" : r.name} — ${r.detail}`);
      }
      if (plan.missing.length) {
        lines.push("", `⚠ ${plan.missing.length} dependency(ies) could not be resolved and were skipped:`);
        for (const id of plan.missing) lines.push(`  - ${id}`);
      }
      return textResult(lines.join("\n"), structured);
    },
  );
}
