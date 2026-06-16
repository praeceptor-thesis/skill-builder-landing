# skill-builder

Publish and install AI skill prompts from the command line — or author them in the web editor with help from an AI drafting assistant.

```bash
npx @dmzagent/skill-builder install @author/skill-id
```

---

## Getting started: installing skills

### Browse the registry

```bash
npx @dmzagent/skill-builder list
```

Filter by category, tag, and sort order:

```bash
npx @dmzagent/skill-builder list --category Conversational
npx @dmzagent/skill-builder list --sort popular
npx @dmzagent/skill-builder list --tag prompt --sort downloads
```

### Search for something specific

```bash
npx @dmzagent/skill-builder search "data pipeline"
npx @dmzagent/skill-builder search dialogue --sort popular
```

### Install a skill

```bash
npx @dmzagent/skill-builder install dialogue-flow
npx @dmzagent/skill-builder install @skillauthor/dialogue-flow
```

Downloads `dialogue-flow.md` and `dialogue-flow.json` to the current directory. Use `--output ./my-skills` to change where files land.

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

### 4. Fork an existing skill (optional)

```bash
npx @dmzagent/skill-builder fork @skillauthor/dialogue-flow --name my-dialogue
```

Creates a copy under your account that you can republish.

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
