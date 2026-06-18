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

## Listed in the official MCP Registry

This server is published to the [official MCP Registry](https://registry.modelcontextprotocol.io)
under the domain-based name `com.dmzagent/skill-builder-mcp`. The registry only stores
metadata (in [`server.json`](./server.json)); the package itself lives on npm.

Publishing is automated by [`.github/workflows/publish-mcp.yml`](../../.github/workflows/publish-mcp.yml),
which runs on a version tag and both publishes to npm and lists in the registry.

### One-time setup (DNS authentication)

The `com.dmzagent` namespace is proven by an apex TXT record on `dmzagent.com`. Generate an
Ed25519 key pair locally — the private half is a CI secret, never committed:

```bash
openssl genpkey -algorithm Ed25519 -out mcp-key.pem
# public key (base64) -> terraform var mcp_registry_public_key:
openssl pkey -in mcp-key.pem -pubout -outform DER | tail -c 32 | base64
# private key (hex) -> the MCP_PRIVATE_KEY GitHub secret:
openssl pkey -in mcp-key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'
```

Then:

1. The public key is committed as the default of `mcp_registry_public_key` in
   [`terraform/mcp-registry.tf`](../../terraform/mcp-registry.tf), so the `deploy.yml`
   `terraform apply` publishes the TXT record on the next push to `main` — no local
   terraform needed. (Override the var in tfvars to rotate the key.)
2. Add repo secrets `MCP_PRIVATE_KEY` (the hex private key) and `NPM_TOKEN` (npm publish token).

### Publish a version

```bash
# bump packages/mcp/package.json + server.json to the new version, commit, then:
git tag v1.0.1 && git push origin v1.0.1
```

To publish manually instead of via CI, from `packages/mcp`:

```bash
npm publish --access public                       # to npm first (registry verifies it)
mcp-publisher login dns --domain dmzagent.com --private-key "$MCP_PRIVATE_KEY"
mcp-publisher publish                              # reads server.json
```

## License

MIT
