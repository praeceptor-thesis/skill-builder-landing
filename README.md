# skill-builder

Publish and install AI skill prompts from the command line — or author them in the web editor with help from an AI drafting assistant.

```bash
npx @concordex-ai/skill-builder install @author/skill-id
```

---

## Getting started: installing skills

### Browse the registry

Results print as a dense table right in your terminal:

```bash
npx @concordex-ai/skill-builder list
```

Filter by category, author, type, tag, and sort order:

```bash
npx @concordex-ai/skill-builder list --category "Developer Tools"
npx @concordex-ai/skill-builder list --type meta          # only meta skills
npx @concordex-ai/skill-builder list --author skillauthor
npx @concordex-ai/skill-builder list --sort downloads
npx @concordex-ai/skill-builder list --json               # machine-readable
npx @concordex-ai/skill-builder list --web                # open the browser registry instead
```

### Search and inspect

```bash
npx @concordex-ai/skill-builder search "data pipeline"    # ranked by relevance
npx @concordex-ai/skill-builder info @skillauthor/dialogue-flow
npx @concordex-ai/skill-builder suggest dial              # autocomplete: skills, tags, authors
```

Wire up shell completion (skills, tags, and authors complete as you type):

```bash
npx @concordex-ai/skill-builder completion >> ~/.bashrc
```

### Install a skill

```bash
npx @concordex-ai/skill-builder install dialogue-flow
npx @concordex-ai/skill-builder install @skillauthor/dialogue-flow
```

Downloads `dialogue-flow.md` and `dialogue-flow.json` to the current directory. Use `--output ./my-skills` to change where files land.

**Meta skills install their dependencies automatically.** Installing a meta skill
resolves its full dependency tree (deduped, cycle-safe) and installs every
required skill alongside it. Use `--no-deps` to install just the meta skill.

```bash
npx @concordex-ai/skill-builder install @skillauthor/my-bundle
# → resolves and installs my-bundle + every skill it depends on
```

---

## Getting started: publishing skills

### 1. Create an account

```bash
npx @concordex-ai/skill-builder register myhandle "My Name" me@email.com
```

You'll be prompted for a password. Or set `SKILL_PASSWORD` to skip the prompt:

```bash
SKILL_PASSWORD=hunter2 npx @concordex-ai/skill-builder register myhandle "My Name" me@email.com
```

### 2. Log in

```bash
npx @concordex-ai/skill-builder login me@email.com
```

Your auth token is printed on success. Set it as `SKILL_TOKEN` so subsequent commands can use it:

```bash
export SKILL_TOKEN=<token-from-login>
```

(Or pass `--token $SKILL_TOKEN` to each command.)

### 3. Publish a skill

From a markdown file:

```bash
npx @concordex-ai/skill-builder publish ./my-skill.md
```

The CLI reads the filename as the skill id and the first heading as the name. You can also use a JSON manifest:

```bash
npx @concordex-ai/skill-builder publish ./my-skill.json
```

### 4. Fork an existing skill (optional)

```bash
npx @concordex-ai/skill-builder fork @skillauthor/dialogue-flow --name my-dialogue
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

## Web App

Visit the web editor at `https://skills.eastern-shore-solutions.com` to:

- Browse the registry visually
- Write skills with a split edit/preview markdown editor
- Draft skills with the AI assistant
- Fork, refine, and republish in one workflow

## Install from source

```bash
npm install
npm run dev --workspace packages/web
```

## License

MIT
