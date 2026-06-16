# Skills

This folder holds skills published to the registry. There are two ways skills land here:

1. **Invented automatically (the claw).** The scheduled workflow
   (`sync-skills.yml`) uses **Claude Opus 4.8 at high reasoning effort** to
   *imagine* brand-new skills each day, commits them here as `.json` manifests,
   and publishes them. Invent some on demand:

   ```bash
   export ANTHROPIC_API_KEY=<your-key>   # generation runs on Claude Opus 4.8
   export SKILL_TOKEN=<your-token>       # publishing to the registry

   npm run imagine            # invent 1 new skill, save to skills/, publish
   npm run imagine:dry        # invent 1 and just print it — saves/publishes nothing

   # Full control:
   node packages/cli/dist/index.js generate --count 3 --out ./skills --publish
   node packages/cli/dist/index.js generate --theme "personal finance" --no-publish --out ./skills

   # Meta skills (bundle existing skills as dependencies):
   node packages/cli/dist/index.js generate --meta --out ./skills --publish        # every one is meta
   node packages/cli/dist/index.js generate --meta-ratio 0.3 --out ./skills --publish  # ~30% meta

   # Tune the model / reasoning effort, or fall back to the free registry AI:
   node packages/cli/dist/index.js generate --effort xhigh --out ./skills --publish
   node packages/cli/dist/index.js generate --backend registry --out ./skills --publish
   ```

   Generation uses **Claude Opus 4.8** (`--model`) at **high** reasoning effort
   (`--effort`, one of low/medium/high/xhigh/max) via `ANTHROPIC_API_KEY`. Pass
   `--backend registry` to use the Worker's built-in Skill Architect instead (no
   key needed). Meta generation picks 2-4 real, existing skills as dependencies
   (it never invents dependency ids), sets `type: meta`, and falls back to a
   basic skill when fewer than two skills exist to bundle. The scheduled run uses
   `--meta-ratio 0.3`.

2. **Hand-authored.** Drop your own `.md` or `.json` files here. Anything new or
   changed is published by the sync.

Both flows publish through the same `sync` step, so they de-duplicate against
what is already live.

## Publishing on demand

From the repo root:

```bash
export SKILL_TOKEN=<your-token>   # from `skill-builder login <email>`

npm run sync           # build the CLI, then publish new/changed skills
npm run sync:dry       # preview only — publish nothing
```

You can also call the CLI directly for more control:

```bash
node packages/cli/dist/index.js sync ./skills --force            # republish everything
node packages/cli/dist/index.js sync ./skills --registry <url>   # target a different registry
```

## Auth tokens

`skill-builder login <email>` returns a **session token that expires after 7
days** — fine for manual use, but it would make the scheduled claw fail weekly.

For automation, mint a **long-lived (non-expiring) API token** instead:

```bash
export SKILL_TOKEN=<session-token-from-login>     # authenticate the request
skill-builder token create --label "skill-claw"   # prints a long-lived skb_… token

skill-builder token list             # id, masked preview, label, created
skill-builder token revoke <id>      # revoke when rotating
```

Use the long-lived token as your durable `SKILL_TOKEN` — locally, or as the
GitHub Actions secret for the schedule:

```bash
gh secret set SKILL_TOKEN     # paste the skb_… token
```

## Basic vs. meta skills

Every skill is one of two kinds:

- **Basic** — a standalone skill. This is the default.
- **Meta** — a skill that bundles others. Declare the skills it needs in
  `dependencies` (front-matter or JSON), using full registry ids like
  `@author/skill-id`. Any skill with a non-empty `dependencies` list is treated
  as `meta` automatically.

When someone runs `skill-builder install @author/my-bundle`, the CLI resolves the
whole dependency tree, dedupes shared skills, and installs every required skill
alongside the meta skill. See `_meta-template.md` for an example.

## File conventions

Two formats are supported:

- **Markdown (`.md`)** — easiest. Optional YAML front-matter for metadata, with the
  body used as the skill content. See `_TEMPLATE.md` (and `_meta-template.md` for a
  meta skill).
- **JSON (`.json`)** — a full structured spec. See `_template.json`.

Rules the sync follows:

- The **skill id** comes from front-matter `id:`, otherwise the file name (slugified).
- The published id is scoped to your handle, e.g. `@yourhandle/your-skill-id`.
- Files starting with `_` or `.`, and `README.md`, are **ignored** — use the `_`
  prefix for templates and drafts you don't want published.
- A skill is only re-published when its content actually changes, so the schedule
  is safe to run as often as you like.

## Required fields

The registry validates every skill. The sync fills sensible defaults from your
markdown, but each published skill ends up with: a name, description, category,
purpose, at least one instruction, and a prompt template. Provide them explicitly
in front-matter for best results.
