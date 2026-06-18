#!/usr/bin/env node
/**
 * skill-builder MCP server.
 *
 * Exposes the skill-builder registry (https://skills.dmzagent.com) to MCP
 * clients — Claude Code, Cursor, Codex, and any other MCP-compatible coding
 * agent — so they can discover skills and auto-install them (with meta-skill
 * dependency resolution) into the current project.
 *
 * Transport: stdio (local). Configuration via environment:
 *   SKILL_API_URL     Registry API base (default https://skills.dmzagent.com/api)
 *   SKILL_TOKEN       Optional bearer token (only for private/draft skills)
 *   SKILL_PROJECT_DIR Default project root for installs (default: cwd)
 *   SKILL_TARGET      Force install target: claude | codex | cursor | file
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { RegistryClient, apiBase } from "./registry-client.js";
import { registerTools } from "./tools.js";
import { DEFAULT_API_URL, SERVER_NAME, SERVER_VERSION } from "./constants.js";

function printHelp(): void {
  const apiUrl = apiBase(process.env.SKILL_API_URL || DEFAULT_API_URL);
  process.stdout.write(
    `${SERVER_NAME} v${SERVER_VERSION}\n\n` +
      `An MCP (Model Context Protocol) stdio server for the skill-builder registry.\n` +
      `Run it from an MCP client, not directly — it speaks JSON-RPC over stdio.\n\n` +
      `Tools: skill_search, skill_info, skill_suggest, skill_taxonomy, skill_install\n\n` +
      `Environment:\n` +
      `  SKILL_API_URL      Registry API base (current: ${apiUrl})\n` +
      `  SKILL_TOKEN        Optional bearer token for private/draft skills\n` +
      `  SKILL_PROJECT_DIR  Default project root for installs (current cwd otherwise)\n` +
      `  SKILL_TARGET       Force install target: claude | codex | cursor | file\n\n` +
      `Example client config (Claude Code, .mcp.json):\n` +
      `  { "mcpServers": { "skill-builder": { "command": "npx",\n` +
      `      "args": ["-y", "@dmzagent/skill-builder-mcp"] } } }\n`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  const apiUrl = apiBase(process.env.SKILL_API_URL || DEFAULT_API_URL);
  const token = process.env.SKILL_TOKEN || null;
  const client = new RegistryClient(apiUrl, token);

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, { client, apiUrl });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs MUST go to stderr — stdout is the JSON-RPC channel.
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio (registry: ${apiUrl})`);
}

main().catch((error) => {
  console.error("Fatal error starting skill-builder MCP server:", error);
  process.exit(1);
});
