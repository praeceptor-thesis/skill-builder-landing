# @dmzagent/skill-builder

[![npm version](https://img.shields.io/npm/v/@dmzagent/skill-builder.svg)](https://www.npmjs.com/package/@dmzagent/skill-builder)
[![license](https://img.shields.io/npm/l/@dmzagent/skill-builder.svg)](https://www.npmjs.com/package/@dmzagent/skill-builder)

Install, author, and publish reusable AI skill prompts from the command line — backed by the [skills.dmzagent.com](https://skills.dmzagent.com) registry.

A **skill** is a portable prompt package (instructions, a prompt template, examples, and tests). A **meta skill** orchestrates other skills and installs its whole dependency tree with it.

```bash
npx @dmzagent/skill-builder install @author/skill-id
```

## Installation

No install needed — use `npx @dmzagent/skill-builder <command>` for any command below.

To get a persistent `skill-builder` command, install globally:

```bash
npm install -g @dmzagent/skill-builder
skill-builder list
```

Requires Node.js >= 18. All examples below use `npx`; if you installed globally, drop the `npx ` and just run `skill-builder`.

## Quick start

```bash
npx @dmzagent/skill-builder search "data pipeline"     # find a skill
npx @dmzagent/skill-builder info @author/skill-id      # inspect it
npx @dmzagent/skill-builder install @author/skill-id   # download it
```

## Finding & installing skills

Browse the registry — results print as a dense table in your terminal:

```bash
npx @dmzagent/skill-builder list
npx @dmzagent/skill-builder list --category "Developer Tools"
npx @dmzagent/skill-builder list --type meta           # only meta skills
npx @dmzagent/skill-builder list --author skillauthor
npx @dmzagent/skill-builder list --sort downloads
npx @dmzagent/skill-builder list --json                # machine-readable
npx @dmzagent/skill-builder list --web                 # open the browser registry
```

Search, inspect, and autocomplete:

```bash
npx @dmzagent/skill-builder search "dialogue"          # ranked by relevance
npx @dmzagent/skill-builder info @skillauthor/dialogue-flow
npx @dmzagent/skill-builder suggest dial               # skills, tags, authors
```

Install — downloads `<skill>.md` and `<skill>.json` to the current directory (use `--output ./dir` to change where they land):

```bash
npx @dmzagent/skill-builder install @skillauthor/dialogue-flow
npx @dmzagent/skill-builder install @skillauthor/dialogue-flow --output ./skills
```

**Meta skills install their dependencies automatically** — the full tree, deduped and cycle-safe. Use `--no-deps` to install just the meta skill on its own:

```bash
npx @dmzagent/skill-builder install @skillauthor/my-bundle
npx @dmzagent/skill-builder install @skillauthor/my-bundle --no-deps
```

Wire up shell completion (skills, tags, and authors complete as you type):

```bash
npx @dmzagent/skill-builder completion >> ~/.zshrc   # or ~/.bashrc
```

## Authoring & publishing skills

### 1. Create an account

```bash
npx @dmzagent/skill-builder register myhandle "My Name" me@email.com
```

You'll be prompted for a password (or set `SKILL_PASSWORD` to skip the prompt).

### 2. Log in and set your token

```bash
npx @dmzagent/skill-builder login me@email.com
export SKILL_TOKEN=<token-printed-on-login>
```

Every publishing command reads `SKILL_TOKEN`, or you can pass `--token <token>` explicitly. Login tokens are short-lived; for automation, mint a long-lived token (see [API tokens](#api-tokens-for-automation)).

### 3. Publish

From a markdown file (the filename becomes the skill id, the first heading the name) or a JSON manifest:

```bash
npx @dmzagent/skill-builder publish ./my-skill.md
npx @dmzagent/skill-builder publish ./my-skill.json
```

### Fork an existing skill

```bash
npx @dmzagent/skill-builder fork @skillauthor/dialogue-flow --name my-dialogue
```

### Sync a folder

Publish every new or changed skill in a directory — built for unattended/CI use:

```bash
npx @dmzagent/skill-builder sync ./skills              # publish new/changed
npx @dmzagent/skill-builder sync ./skills --dry-run    # preview, write nothing
```

### Generate skills with AI

Invent brand-new skills with the registry's AI, then save and/or publish them:

```bash
npx @dmzagent/skill-builder generate --count 3 --dry-run        # preview only
npx @dmzagent/skill-builder generate --count 3 --out ./skills   # save locally
npx @dmzagent/skill-builder generate --count 3 --publish        # save + publish
```

## API tokens (for automation)

Long-lived tokens don't expire and are ideal for CI. Manage them with `token <create|list|revoke>` (you must already be authenticated):

```bash
npx @dmzagent/skill-builder token create --label ci
npx @dmzagent/skill-builder token list
npx @dmzagent/skill-builder token revoke <id>
```

Store the resulting `skb_…` token as `SKILL_TOKEN` in your CI secrets.

## Environment variables

| Variable         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `SKILL_TOKEN`    | Auth token for publishing commands (or pass `--token`).                 |
| `SKILL_API_URL`  | Override the registry API base. Default: `https://skills.dmzagent.com/api`. |
| `SKILL_PASSWORD` | Supply a password non-interactively for `register` / `login`.           |

Most commands also accept `--registry <url>` to target a different registry per-invocation.

## Web app

Prefer a UI? Visit [skills.dmzagent.com](https://skills.dmzagent.com) to browse the registry, write skills in a split edit/preview editor, draft them with the AI assistant, and fork/refine/republish — all in the browser.

## License

MIT
