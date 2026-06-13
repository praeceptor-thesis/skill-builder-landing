# Skill Builder Landing

A monorepo with a designer-grade AI skill builder website and a CLI for installing/publishing skills.

## Packages

- `packages/web`: React + Vite + Tailwind skill builder UI.
- `packages/cli`: Node CLI with install/publish commands.

## Getting started

Install dependencies:

```bash
cd /home/the-resurrection/skill-builder-landing
npm install
```

Run the web app:

```bash
npm run dev --workspace packages/web
```

Build all packages:

```bash
npm run build
```

Use the CLI locally:

```bash
cd packages/cli
npm run build
node dist/index.js install dialogue-flow
```

## Future work

- Add skill persistence and registry backend
- Enable real sandbox evaluation
- Support `npx skill-builder` installs for Frontier model configs

## Cloudflare deployment

This repo includes a Cloudflare deployment setup for:

- Cloudflare Pages for the React frontend
- Cloudflare Worker API for skill persistence
- Workers KV namespace for stored skill data
- Custom domain `skills.eastern-shore-solutions.com`

### How to deploy

1. Install Terraform.
2. Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars`.
3. Set your Cloudflare API token and account ID in `terraform/terraform.tfvars`.
4. Run:

```bash
cd /home/the-resurrection/skill-builder-landing/terraform
terraform init
terraform apply
```

### Notes

- Pages builds the frontend from `packages/web` and publishes `packages/web/dist`.
- The worker is deployed from `worker/skill-persistence-worker.js`.
- The frontend code calls the API at `https://skills.eastern-shore-solutions.com/api/skills`.
