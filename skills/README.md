# Skills

This folder holds skills published to the registry. There are two ways skills land here:

1. **Invented automatically (the claw).** The scheduled workflow
   (`.github/workflows/imagine-skills` in `sync-skills.yml`) uses the registry's
   own Skill Architect AI to *imagine* brand-new skills each day, commits them
   here as `.json` manifests, and publishes them. Invent some on demand:

   ```bash
   export SKILL_TOKEN=<your-token>

   npm run imagine            # invent 1 new skill, save to skills/, publish
   npm run imagine:dry        # invent 1 and just print it — saves/publishes nothing

   # Full control:
   node packages/cli/dist/index.js generate --count 3 --out ./skills --publish
   node packages/cli/dist/index.js generate --theme "personal finance" --no-publish --out ./skills
   ```

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

Auth uses your registry token. Get one with `skill-builder login <email>` and set
it as `SKILL_TOKEN` (locally) or as a GitHub Actions secret named `SKILL_TOKEN`
(for the schedule).

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
