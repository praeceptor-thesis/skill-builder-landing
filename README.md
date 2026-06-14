# skill-builder

Publish and install AI skill prompts from the command line — or author them in the web editor with help from an AI drafting assistant.

```bash
npx skill-builder install @author/skill-id
```

## CLI

### Install

```bash
npx skill-builder install dialogue-flow
npx skill-builder install @skillauthor/dialogue-flow
```

Downloads the skill markdown and config to `./<skill-id>.md` and `./<skill-id>.json`. Pass `--output <dir>` to change the target.

### Publish

```bash
npx skill-builder publish ./my-skill.md --token $SKILL_TOKEN
npx skill-builder publish ./my-skill.json --token $SKILL_TOKEN
```

Publishes a skill to the registry. Requires an auth token (get one via `login`).

### List & Search

```bash
npx skill-builder list
npx skill-builder list --sort popular --category Conversational
npx skill-builder search "data pipeline" --sort downloads
```

### Fork

```bash
npx skill-builder fork @skillauthor/dialogue-flow --name my-dialogue --token $SKILL_TOKEN
```

Creates a derivative of an existing skill under your own account.

### Auth

```bash
# Register (you'll be prompted for a password)
npx skill-builder register myhandle "My Name" me@email.com

# Login (you'll be prompted for your password)
npx skill-builder login me@email.com
```

Set `SKILL_PASSWORD` to skip the password prompt in scripts. After login, set `SKILL_TOKEN` for authenticated commands.

## Web App

The web editor at `https://skills.eastern-shore-solutions.com` provides:

- **Markdown editor** with split edit/preview mode
- **AI assistant** — describe the skill you want, get a markdown draft
- **Public registry** — browse, search, and filter skills
- **Fork → refine → republish** workflow

## Install from source

```bash
npm install
npm run dev --workspace packages/web
```

## License

MIT
