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
