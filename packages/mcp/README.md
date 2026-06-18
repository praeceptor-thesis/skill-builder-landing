# @dmzagent/skill-builder-mcp

An [MCP](https://modelcontextprotocol.io) server that connects coding agents —
**Claude Code, Cursor, Codex**, and any other MCP-compatible tool — to the
[skill-builder registry](https://skills.dmzagent.com). Agents can search the
registry and **auto-install** skills (resolving meta-skill dependency trees)
directly into the current project.

```jsonc
// One line in your MCP config — no global install needed:
{ "command": "npx", "args": ["-y", "@dmzagent/skill-builder-mcp"] }
```

## Tools

| Tool | What it does | Writes files? |
|------|--------------|---------------|
| `skill_search` | Search/browse the registry with filters and sorting | No |
| `skill_info` | Full details + markdown body for one skill (no download counted) | No |
| `skill_suggest` | Autocomplete skills, tags, authors, categories | No |
| `skill_taxonomy` | Categories / tags / authors / types with counts | No |
| `skill_install` | Install a skill (+ dependencies for meta skills) into the project | **Yes** |

`skill_install` writes the files each tool expects:

- **claude** → appends the skill to `CLAUDE.md` under a `## <name>` heading (re-installs are skipped via a hidden `<!-- skill-id -->` marker).
- **codex** → same, but to `AGENTS.md`.
- **cursor** → `.cursor/rules/<slug>.mdc` with frontmatter.
- **file** → `<slug>.md` + a `<slug>.json` manifest in `output_dir`.

With `target: "auto"` (the default), the server detects the right one from the
project (`.cursor/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, or env) and falls
back to `file`.

## Configuration

All configuration is via environment variables — all optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SKILL_API_URL` | `https://skills.dmzagent.com/api` | Registry API base (a bare site URL is fine; `/api` is appended). |
| `SKILL_TOKEN` | _(none)_ | Bearer token; only needed to see your own private/draft skills. |
| `SKILL_PROJECT_DIR` | server cwd | Default project root that installs write into. |
| `SKILL_TARGET` | _(auto-detect)_ | Force the install target: `claude` \| `codex` \| `cursor` \| `file`. |

> Most clients launch the server with the project as its working directory, so
> installs land in the right place automatically. If yours doesn't, set
> `SKILL_PROJECT_DIR` or pass `project_dir` to `skill_install`.

## Client setup

### Claude Code

Add it from the project root, or drop the config into `.mcp.json`:

```bash
claude mcp add skill-builder -- npx -y @dmzagent/skill-builder-mcp
```

```jsonc
// .mcp.json
{
  "mcpServers": {
    "skill-builder": {
      "command": "npx",
      "args": ["-y", "@dmzagent/skill-builder-mcp"]
    }
  }
}
```

### Cursor

```jsonc
// .cursor/mcp.json (project) or ~/.cursor/mcp.json (global)
{
  "mcpServers": {
    "skill-builder": {
      "command": "npx",
      "args": ["-y", "@dmzagent/skill-builder-mcp"]
    }
  }
}
```

### Codex (OpenAI Codex CLI)

```toml
# ~/.codex/config.toml
[mcp_servers.skill-builder]
command = "npx"
args = ["-y", "@dmzagent/skill-builder-mcp"]
```

### Any other MCP client

Launch this command and speak MCP over **stdio**:

```bash
npx -y @dmzagent/skill-builder-mcp
```

Optionally pass env vars, e.g. `SKILL_TARGET=cursor SKILL_PROJECT_DIR=/path/to/project`.

## Example agent flow

```text
1. skill_search { "query": "literature review", "type": "meta" }
2. skill_info   { "skill": "@kmd_ai/paperdistillery-orchestrated-literature-to-briefing-pipeline" }
3. skill_install{ "skill": "@kmd_ai/paperdistillery-orchestrated-literature-to-briefing-pipeline" }
   → resolves the dependency tree and installs every required skill for the detected tool.
```

Use `dry_run: true` on `skill_install` to preview exactly which files would be
written before committing.

## Develop / build from source

This package lives in the `skill-builder-landing` monorepo.

```bash
npm install
npm run build --workspace packages/mcp        # tsc → dist/
node packages/mcp/dist/index.js --help        # sanity check
npx @modelcontextprotocol/inspector node packages/mcp/dist/index.js   # interactive testing
```

The registry data model and types mirror the Worker API; like the other
packages in this repo, the MCP server keeps its own copy of the types and the
install logic (adapted from `packages/cli`) so the published package is
self-contained.

## License

MIT
