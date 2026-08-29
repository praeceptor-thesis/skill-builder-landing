# skill-builder

Publish and install AI skill prompts from the command line — or author them in the web editor with help from an AI drafting assistant.

```bash
npx @dmzagent/skill-builder install @author/skill-id
```

---

## Getting started: installing skills

### Browse the registry

Results print as a dense table right in your terminal:

```bash
npx @dmzagent/skill-builder list
```

Filter by category, author, type, tag, and sort order:

```bash
npx @dmzagent/skill-builder list --category "Developer Tools"
npx @dmzagent/skill-builder list --type meta          # only meta skills
npx @dmzagent/skill-builder list --author skillauthor
npx @dmzagent/skill-builder list --sort downloads
npx @dmzagent/skill-builder list --json               # machine-readable
npx @dmzagent/skill-builder list --web                # open the browser registry instead
```

### Search and inspect

```bash
npx @dmzagent/skill-builder search "data pipeline"    # ranked by relevance
npx @dmzagent/skill-builder info @skillauthor/dialogue-flow
npx @dmzagent/skill-builder suggest dial              # autocomplete: skills, tags, authors
```

Wire up shell completion (skills, tags, and authors complete as you type):

```bash
npx @dmzagent/skill-builder completion >> ~/.bashrc
```

### Install a skill

```bash
npx @dmzagent/skill-builder install dialogue-flow
npx @dmzagent/skill-builder install @skillauthor/dialogue-flow
```

Downloads `dialogue-flow.md` and `dialogue-flow.json` to the current directory. Use `--output ./my-skills` to change where files land.

**Meta skills install their dependencies automatically.** Installing a meta skill
resolves its full dependency tree (deduped, cycle-safe) and installs every
required skill alongside it. Use `--no-deps` to install just the meta skill.

```bash
npx @dmzagent/skill-builder install @skillauthor/my-bundle
# → resolves and installs my-bundle + every skill it depends on
```

---

## Getting started: publishing skills

### 1. Create an account

```bash
npx @dmzagent/skill-builder register myhandle "My Name" me@email.com
```

You'll be prompted for a password. Or set `SKILL_PASSWORD` to skip the prompt:

```bash
SKILL_PASSWORD=hunter2 npx @dmzagent/skill-builder register myhandle "My Name" me@email.com
```

### 2. Log in

```bash
npx @dmzagent/skill-builder login me@email.com
```

Your auth token is printed on success. Set it as `SKILL_TOKEN` so subsequent commands can use it:

```bash
export SKILL_TOKEN=<token-from-login>
```

(Or pass `--token $SKILL_TOKEN` to each command.)

### 3. Publish a skill

From a markdown file:

```bash
npx @dmzagent/skill-builder publish ./my-skill.md
```

The CLI reads the filename as the skill id and the first heading as the name. You can also use a JSON manifest:

```bash
npx @dmzagent/skill-builder publish ./my-skill.json
```

### 4. Declare the capabilities a skill needs (optional)

A skill can declare what a model must be able to do to invoke it. The
declaration lives on the spec, so it travels with the skill through the
registry, the CLI, and MCP — an agent can tell whether it is able to run a skill
before it spends a turn on it.

```json
{
  "capabilities": [
    { "id": "vision", "level": "required", "note": "reads chart images" },
    { "id": "long-context", "level": "preferred" }
  ]
}
```

`required` capabilities gate execution: the registry refuses to run a skill on a
runtime that cannot provide one, unless the caller explicitly forces a degraded
run. `preferred` capabilities only weaken the result. Catalog ids:

```
vision · audio-input · file-input · structured-output · streaming
extended-reasoning · long-context · multilingual
tool-use · parallel-tool-calls · code-execution · web-search · file-system
computer-use · mcp-client
persistent-memory · citations
```

Custom ids are accepted for anything the catalog does not model yet. `info` and
`list` show the contract, and `install` rolls it up across a meta skill's whole
dependency tree — a meta skill only runs where every skill it installs can run.

```bash
npx @dmzagent/skill-builder info @skillauthor/chart-reader
# Required capabilities (1) — the invoking model must provide these:
#   - vision (required) — reads chart images
```

### 5. Fork an existing skill (optional)

```bash
npx @dmzagent/skill-builder fork @skillauthor/dialogue-flow --name my-dialogue
```

Creates a copy under your account that you can republish.

---

## Maintaining the registry: backfill dependencies

`scripts/backfill-dependencies.mjs` finds existing skills that implicitly
orchestrate other skills and proposes explicit `dependencies` + `type: "meta"`
for them. It reads every skill, detects references to other *real* registry
skills (by full id, `install` directives, or distinctive names), scores a
confidence level, and merges a curated set of known-correct mappings.

It is **dry-run by default** — it prints a report and writes nothing:

```bash
node scripts/backfill-dependencies.mjs                 # report only
node scripts/backfill-dependencies.mjs --json          # machine-readable
```

To apply, pass `--apply` with a token. Only skills owned by the token's account
are updated (others are listed and skipped), so run it once per publishing
account:

```bash
SKILL_TOKEN=<token> node scripts/backfill-dependencies.mjs --apply
node scripts/backfill-dependencies.mjs --apply --include-medium   # also apply medium-confidence
```

Confidence tiers: `curated` and `high` (explicit id / install / distinctive-name
references) apply by default; `medium` (fuzzy name match) only with
`--include-medium`; `meta-no-deps` (orchestration language but no concrete
dependency) is reported for manual review and never auto-applied.

> Applying requires the registry to run the worker build that understands
> `type`/`dependencies` (it derives `type` and regenerates markdown on save).
> The dry-run report works against any deployed version.

---

## Use from coding agents (MCP)

Coding agents — Claude Code, Cursor, Codex, and other MCP clients — can search the
registry and **auto-install** skills (resolving meta-skill dependency trees) via the
[`@dmzagent/skill-builder-mcp`](packages/mcp) MCP server.

```jsonc
// e.g. .mcp.json (Claude Code) or .cursor/mcp.json (Cursor)
{
  "mcpServers": {
    "skill-builder": { "command": "npx", "args": ["-y", "@dmzagent/skill-builder-mcp"] }
  }
}
```

Tools: `skill_search`, `skill_info`, `skill_suggest`, `skill_taxonomy`, and
`skill_install` (writes skill files for the detected tool). See
[`packages/mcp/README.md`](packages/mcp/README.md) for per-client setup.

---

## Web App

Visit the skill studio at `https://skills.dmzagent.com`. The workspace is three
collapsible panes plus a settings drawer:

- **Skill Architect** — an agent that edits the spec directly rather than
  handing back markdown, with suggested next steps drawn from whatever the spec
  is still missing.
- **Spec canvas** — the skill as a document: capability contract, instructions,
  prompt template with its `{{variables}}` highlighted, examples and tests, and
  a publish-readiness checklist that links into the field behind each gap.
- **Preview** — run the skill for real. Template variables become fields, a
  capability preflight says whether the runtime can honestly execute it, and
  every run is scored against the expectation it came from. Any run can be
  handed back to the architect for review.
- **Architecture** — for meta skills, the dependency tree as a layered graph
  with unresolved ids and cycles flagged, and the capability contract rolled up
  across everything the skill installs.
- **Settings drawer** — every field of the spec, out of the way until you want
  it: identity, behavior, capabilities, composition, examples and tests, and the
  generated markdown artifact.

## Install from source

```bash
npm install
npm run dev --workspace packages/web
```

## License

MIT
