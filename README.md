# skill-builder

Designer-grade skill editor with AI drafting, a public registry, and a CLI — all powered by a Cloudflare Worker backend.

```
npx skill-builder install @author/skill-id
```

## CLI

The CLI is the fastest way to find, install, and publish skills.

### Install

```bash
npx skill-builder install dialogue-flow
npx skill-builder install @skillauthor/dialogue-flow   # with author handle
```

Downloads the skill markdown and config to the current directory. Use `--output <dir>` to change the target.

### Publish

```bash
# Publish from a markdown file (auto-generates id/name from filename)
npx skill-builder publish ./my-skill.md --token $SKILL_TOKEN

# Publish from a .json definition (companion .md loaded automatically)
npx skill-builder publish ./my-skill.json --token $SKILL_TOKEN
```

Requires an auth token. Get one via `login`.

### List & Search

```bash
npx skill-builder list
npx skill-builder list --sort popular --category Conversational --tag prompt
npx skill-builder search "data pipeline" --sort downloads
```

### Fork

```bash
npx skill-builder fork @skillauthor/dialogue-flow --name my-dialogue --token $SKILL_TOKEN
```

### Auth

```bash
# Register
npx skill-builder register myhandle "My Name" me@email.com
# ^ you'll be prompted for a password (or set SKILL_PASSWORD)

# Login
npx skill-builder login me@email.com
# ^ you'll be prompted for your password (or set SKILL_PASSWORD)
```

On success, the CLI prints your auth token. Set it as `SKILL_TOKEN` for subsequent `publish` and `fork` commands.

### Options

All commands accept `--registry <url>` to target a different API endpoint (default: `https://skills.eastern-shore-solutions.com/api`).

| Flag | Env var | Used by |
|------|---------|---------|
| `--token` | `SKILL_TOKEN` | `publish`, `fork` |
| (prompt) | `SKILL_PASSWORD` | `login`, `register` |

## Web App

The web app at `packages/web` provides:

- **Landing page** — two-path layout (Browse registry / Author skills)
- **Markdown editor** with split edit/preview mode
- **AI drafting assistant** — describe the skill you want, get markdown drafts via Llama 3.1 8B
- **Public registry modal** — search, filter by category/tag, sort by downloads or popularity
- **Fork → refine → republish** workflow with conflict detection

Run locally:

```bash
npm run dev --workspace packages/web
```

The dev server proxies `/api` to `http://localhost:8787` where the Worker runs.

## Worker API

The Worker at `worker/skill-persistence-worker.js` is a Cloudflare Workers backend with KV storage and Workers AI inference (Llama 3.1 8B).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/skills` | — | List/search skills with pagination, category, tag, sort |
| `GET` | `/api/skills/:id` | — | Get a single skill |
| `POST` | `/api/skills` | Bearer | Create a new skill |
| `PUT` | `/api/skills/:id` | Bearer | Update an existing skill |
| `DELETE` | `/api/skills/:id` | Bearer | Delete a skill |
| `POST` | `/api/skills/:id/fork` | Bearer | Fork a skill |
| `POST` | `/api/agent/chat` | — | Draft skill markdown with AI |
| `POST` | `/api/skills/:id/execute` | — | Run a skill's prompt template |
| `POST` | `/api/auth/register` | — | Create account |
| `POST` | `/api/auth/login` | — | Sign in, get token |
| `GET` | `/api/auth/me` | Bearer | Current user info |

### Response format

All endpoints return a standard envelope:

```json
{ "ok": true, "data": { ... } }
{ "ok": false, "error": { "code": "SKILL_NOT_FOUND", "message": "Skill not found" } }
```

Run the Worker locally (requires `--remote` for AI bindings):

```bash
npx wrangler dev worker/skill-persistence-worker.js --remote
```

## Development

This is a monorepo with npm workspaces:

```
skill-builder-landing/
├── packages/
│   ├── shared/        # TypeScript types + API client (shared by web, CLI, worker)
│   ├── web/           # React + Vite + Tailwind web app
│   └── cli/           # Node CLI (published as `skill-builder`)
├── worker/            # Cloudflare Worker (plain .js, module format)
└── terraform/         # Infrastructure as code
```

### Setup

```bash
npm install
```

### Run everything locally

Terminal 1 — Worker:

```bash
npx wrangler dev worker/skill-persistence-worker.js --remote
```

Terminal 2 — Web app:

```bash
npm run dev --workspace packages/web
```

Terminal 3 — CLI (from source):

```bash
node packages/cli/dist/index.js list
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test --workspace packages/web
```

## Deployment

Infrastructure is managed via Terraform. To deploy:

```bash
cd terraform
terraform init
terraform apply
```

See `terraform/main.tf` for the full setup: KV namespace, Workers script, Pages project, and domain.

## Architecture

- **Auth**: PBKDF2 password hashing with per-user `crypto.getRandomValues()` salt. Tokens stored in KV with 7-day TTL.
- **Handle system**: Every user gets a unique `@handle` — used in npx commands (`npx skill-builder install @handle/id`). Mapped in KV as `handles/<handle>` → email.
- **Fork attribution**: Forked skills append `*Forked from @original/id — original by Name*` to the markdown.
- **AI**: Uses `@cf/meta/llama-3.1-8b-instruct` via Cloudflare Workers AI for both drafting chat and skill execution.
- **Popular sort**: `downloads * 100 - daysSinceUpdate`.
- **Chat truncation**: System message preserved, last 19 user/assistant messages kept.

## License

MIT
