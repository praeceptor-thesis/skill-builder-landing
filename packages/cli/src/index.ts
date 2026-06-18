#!/usr/bin/env node
import cac from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import { createApiClient, type SkillPayload, type RegistrySearchParams } from './api/client.js';
import { runSync } from './sync.js';
import { runGenerate } from './generate.js';
import { resolveInstallPlan, writeSkillForTool } from './install.js';
import { renderSkillTable, renderSkillInfo, renderSuggestions, displayId, effectiveType } from './render.js';

const DEFAULT_API = 'https://skills.dmzagent.com/api';

/** Normalize a registry value to its API base, tolerating a bare site URL. */
function apiBase(registry: string): string {
  const trimmed = registry.replace(/\/+$/, '');
  return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
}

/** Open a URL in the user's default browser (best effort). */
function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execSync(`${cmd} "${url}"`);
}

const cli = cac('skill-builder');

cli
  .command('install <skill>', 'Install a skill package from the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: DEFAULT_API,
  })
  .option('-o, --output <dir>', 'Output directory for skill files (only for --tool file)', {
    default: '.',
  })
  .option('-t, --tool <tool>', 'Target AI tool: file, claude, codex, cursor', {
    default: 'file',
  })
  .option('--agents-file <path>', 'Path to AGENTS.md (for claude/codex)', {
    default: './AGENTS.md',
  })
  .option('--no-deps', 'Skip dependencies (install the meta skill only)')
  .action(async (skill, options) => {
    const registry = apiBase(options.registry as string);
    const tool = (options.tool as string) || 'file';
    const writeOpts = { tool, outputDir: options.output as string, agentsFile: options.agentsFile as string };
    const withDeps = options.deps !== false; // cac sets deps=false for --no-deps
    const client = createApiClient(registry);

    console.log(`Installing ${skill} from ${registry} [--tool ${tool}]`);

    try {
      const plan = await resolveInstallPlan(client, skill);
      const isMeta = effectiveType(plan.root) === 'meta';

      // Decide the full install set (deps first so prerequisites land first).
      const toInstall = withDeps ? [...plan.deps, plan.root] : [plan.root];

      if (isMeta) {
        if (withDeps) {
          console.log(
            `\n${plan.root.name} is a meta skill. Install plan (${toInstall.length} skill${toInstall.length === 1 ? '' : 's'}):`,
          );
          plan.deps.forEach((dep) => console.log(`  • ${displayId(dep)}  (dependency)`));
          console.log(`  • ${displayId(plan.root)}  (meta)`);
        } else {
          console.log(`\n${plan.root.name} is a meta skill; skipping ${plan.root.dependencies?.length ?? 0} dependency(ies) (--no-deps).`);
        }
        if (plan.missing.length > 0) {
          console.warn(`\n⚠ ${plan.missing.length} dependency(ies) could not be resolved and were skipped:`);
          plan.missing.forEach((id) => console.warn(`    - ${id}`));
        }
      }

      console.log('');
      for (const item of toInstall) {
        for (const line of writeSkillForTool(item, writeOpts)) console.log(line);
      }

      console.log(
        `\nDone. Installed ${toInstall.length} skill${toInstall.length === 1 ? '' : 's'}${isMeta && withDeps ? ` (1 meta + ${plan.deps.length} dependency${plan.deps.length === 1 ? '' : 'ies'})` : ''}.`,
      );
      if (plan.missing.length > 0) process.exit(1);
    } catch (error) {
      console.error('Install failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('publish <path>', 'Publish a local skill to the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.dmzagent.com/api',
  })
  .option('-t, --token <token>', 'Auth token for registry')
  .action(async (skillPath, options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);
    if (options.token) client.setToken(options.token as string);

    console.log(`Publishing skill from ${skillPath} to ${registry}`);

    try {
      const fullPath = path.resolve(skillPath);

      let skill: SkillPayload;

      if (fullPath.endsWith('.json')) {
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        let markdown = '';
        const mdPath = fullPath.replace(/\.json$/, '.md');
        if (fs.existsSync(mdPath)) {
          markdown = fs.readFileSync(mdPath, 'utf-8');
        }
        skill = { ...raw, markdown: raw.markdown || markdown };
      } else if (fullPath.endsWith('.md') || fullPath.endsWith('.mjs') || fullPath.endsWith('.js')) {
        if (fullPath.endsWith('.md')) {
          const name = path.basename(fullPath, '.md');
          skill = {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: '',
            category: 'Utilities',
            tags: [],
            markdown: fs.readFileSync(fullPath, 'utf-8'),
          };
        } else {
          const skillModule = await import(pathToFileURL(fullPath).href);
          skill = skillModule.default || skillModule;
          if (!skill.markdown) {
            const mdPath = fullPath.replace(/\.(mjs|js)$/, '.md');
            if (fs.existsSync(mdPath)) {
              skill.markdown = fs.readFileSync(mdPath, 'utf-8');
            }
          }
        }
      } else {
        throw new Error('Path must be a .json, .md, or .js/.mjs file');
      }

      if (!skill.id || !skill.name) {
        throw new Error('Skill must have id and name');
      }

      console.log('Packaging skill manifest...');
      const response = await client.saveSkill(skill);

      console.log('Published successfully!');
      const displayId = response.skill.id.startsWith('@') ? response.skill.id : response.skill.authorHandle ? `@${response.skill.authorHandle}/${response.skill.id}` : response.skill.id;
      console.log(`Skill ID: ${displayId}`);
      console.log(`Skill Name: ${response.skill.name}`);
      console.log(`Install with: npx skill-builder install ${displayId}`);
    } catch (error) {
      console.error('Publish failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('token <action> [id]', 'Manage long-lived API tokens for automation (action: create | list | revoke)')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: process.env.SKILL_API_URL || 'https://skills.dmzagent.com/api',
  })
  .option('-t, --token <token>', 'An existing valid token to authenticate with (defaults to SKILL_TOKEN)')
  .option('-l, --label <label>', 'Label for the new token (create only)', { default: 'automation' })
  .action(async (action, id, options) => {
    const registry = options.registry as string;
    const authToken = (options.token as string) || process.env.SKILL_TOKEN || '';
    const client = createApiClient(registry);

    if (!authToken) {
      console.error('Authenticate first: pass --token or set SKILL_TOKEN (run `skill-builder login <email>`).');
      process.exit(1);
    }
    client.setToken(authToken);

    try {
      switch (action) {
        case 'create': {
          const res = await client.createApiToken(options.label as string);
          console.log('Long-lived API token created. Copy it now — it is not shown again:');
          console.log('');
          console.log(`  ${res.token}`);
          console.log('');
          console.log(`id: ${res.id}   label: ${res.label}`);
          console.log('Set it as SKILL_TOKEN locally, or: gh secret set SKILL_TOKEN');
          break;
        }
        case 'list': {
          const { tokens } = await client.listApiTokens();
          if (tokens.length === 0) {
            console.log('No API tokens.');
          } else {
            for (const t of tokens) {
              console.log(`${t.id}\t${t.preview ?? ''}\t${t.label}\t${t.createdAt}`);
            }
          }
          break;
        }
        case 'revoke': {
          if (!id) {
            console.error('Usage: skill-builder token revoke <id>   (get ids from `skill-builder token list`)');
            process.exit(1);
          }
          await client.revokeApiToken(id);
          console.log(`Revoked API token ${id}.`);
          break;
        }
        default:
          console.error(`Unknown action "${action}". Use: create | list | revoke <id>.`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Token command failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('generate', 'Invent brand-new skills with the registry AI, then save and/or publish them')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: process.env.SKILL_API_URL || 'https://skills.dmzagent.com/api',
  })
  .option('-t, --token <token>', 'Auth token for registry (defaults to SKILL_TOKEN)')
  .option('-n, --count <count>', 'How many skills to invent', { default: 1 })
  .option('--theme <theme>', 'Force a domain/theme (otherwise a random one is chosen per skill)')
  .option('--meta', 'Invent meta skills that bundle existing skills as dependencies')
  .option('--meta-ratio <ratio>', 'Fraction (0-1) of invented skills that should be meta', { default: 0 })
  .option('--backend <name>', "Generation backend: 'anthropic' (Opus 4.8) or 'registry'", { default: 'anthropic' })
  .option('--model <id>', 'Anthropic model id', { default: 'claude-opus-4-8' })
  .option('--effort <level>', 'Anthropic reasoning effort: low|medium|high|xhigh|max', { default: 'high' })
  .option('-o, --out <dir>', 'Write each invented skill as a .json manifest into this folder')
  .option('--publish', 'Publish invented skills to the registry (requires a token)')
  .option('--no-publish', 'Do not publish; only generate (use with --out)')
  .option('--dry-run', 'Invent and print, but neither save nor publish')
  .action(async (options) => {
    const registry = options.registry as string;
    const token = (options.token as string) || process.env.SKILL_TOKEN || '';
    const count = Math.max(1, parseInt(String(options.count), 10) || 1);
    const metaRatio = options.meta ? 1 : Math.max(0, Math.min(1, parseFloat(String(options.metaRatio)) || 0));
    const backend = (options.backend === 'registry' ? 'registry' : 'anthropic') as 'anthropic' | 'registry';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
    const outDir = options.out ? path.resolve(options.out as string) : undefined;

    if (backend === 'anthropic' && !anthropicApiKey) {
      console.error('Anthropic backend needs ANTHROPIC_API_KEY in the environment. Set it, or pass --backend registry.');
      process.exit(1);
    }
    // cac exposes --no-publish as publish === false; default to publishing when a token exists.
    const publish = options.publish === false ? false : (Boolean(options.publish) || (!options.out && Boolean(token)));

    if (publish && !token && !options.dryRun) {
      console.error('Publishing requires a token. Pass --token, set SKILL_TOKEN, or use --no-publish with --out.');
      process.exit(1);
    }
    if (!publish && !outDir && !options.dryRun) {
      console.error('Nothing to do: pass --out <dir> to save, --publish to publish, or --dry-run to preview.');
      process.exit(1);
    }

    const backendLabel = backend === 'anthropic' ? `${options.model} (effort ${options.effort})` : 'registry Skill Architect';
    console.log(`Imagining ${count} new skill(s) with ${backendLabel}${options.dryRun ? ' (dry-run)' : ''}...`);

    try {
      const result = await runGenerate({
        registry,
        token,
        count,
        theme: options.theme as string | undefined,
        outDir,
        publish,
        dryRun: Boolean(options.dryRun),
        metaRatio,
        backend,
        anthropicApiKey,
        model: options.model as string,
        effort: options.effort as string,
        log: (msg) => console.log(msg),
      });

      console.log('');
      console.log(
        `Done: ${result.published} published, ${result.saved} saved, ${result.duplicate} duplicate, ${result.invalid} invalid, ${result.failed} failed.`,
      );
      if (result.failed > 0 && result.published === 0 && result.saved === 0) process.exit(1);
    } catch (error) {
      console.error('Generate failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('sync [dir]', 'Publish all new or changed skills in a folder to the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: process.env.SKILL_API_URL || 'https://skills.dmzagent.com/api',
  })
  .option('-t, --token <token>', 'Auth token for registry (defaults to SKILL_TOKEN)')
  .option('--dry-run', 'Show what would be published without publishing')
  .option('--force', 'Publish every skill even if unchanged')
  .action(async (dir, options) => {
    const targetDir = path.resolve(dir || process.env.SKILL_DIR || './skills');
    const registry = options.registry as string;
    const token = (options.token as string) || process.env.SKILL_TOKEN || '';

    if (!token) {
      console.error('No auth token. Pass --token or set SKILL_TOKEN (run `skill-builder login <email>` to get one).');
      process.exit(1);
    }

    console.log(`Syncing skills from ${targetDir} -> ${registry}${options.dryRun ? ' (dry-run)' : ''}`);

    try {
      const result = await runSync({
        dir: targetDir,
        registry,
        token,
        dryRun: Boolean(options.dryRun),
        force: Boolean(options.force),
        log: (msg) => console.log(msg),
      });

      console.log('');
      const verb = options.dryRun ? 'would publish' : 'published';
      console.log(
        `Done: ${result.published} ${verb}, ${result.skipped} unchanged, ${result.invalid} invalid, ${result.failed} failed.`,
      );

      if (result.invalid > 0 || result.failed > 0) process.exit(1);
    } catch (error) {
      console.error('Sync failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function browseUrl(registry: string, params: Record<string, string | undefined>): string {
  const site = apiBase(registry).replace(/\/api$/, '');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return `${site}/browse${s ? `?${s}` : ''}`;
}

async function runListing(params: RegistrySearchParams, options: Record<string, unknown>): Promise<void> {
  const client = createApiClient(apiBase(options.registry as string));
  const result = await client.listSkills(params);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderSkillTable(result.skills));
  const shown = result.skills.length;
  console.log(`\n${result.total} skill(s) • page ${result.page} • showing ${shown}`);
  if (shown > 0) console.log('Details: skill-builder info <id>   Install: skill-builder install <id>');
}

cli
  .command('list', 'List skills from the registry, printed in your terminal')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', { default: DEFAULT_API })
  .option('-q, --query <query>', 'Search query')
  .option('-c, --category <category>', 'Filter by category')
  .option('-a, --author <handle>', 'Filter by author handle')
  .option('--type <type>', 'Filter by type: basic or meta')
  .option('--tag <tag...>', 'Filter by tag (can be repeated)')
  .option('--sort <sort>', 'Sort order: recent, popular, downloads, relevant')
  .option('-p, --page <page>', 'Page number', { default: 1 })
  .option('--page-size <size>', 'Results per page', { default: 30 })
  .option('--json', 'Output raw JSON')
  .option('--web', 'Open the browser registry instead of printing')
  .action(async (options) => {
    if (options.web) {
      const url = browseUrl(options.registry as string, {
        q: options.query as string | undefined,
        category: options.category as string | undefined,
        sort: options.sort as string | undefined,
      });
      console.log(`Opening ${url}`);
      openInBrowser(url);
      return;
    }
    try {
      await runListing(
        {
          query: options.query as string | undefined,
          category: options.category as string | undefined,
          author: options.author as string | undefined,
          type: options.type as RegistrySearchParams['type'],
          tags: options.tag as string[] | undefined,
          sort: (options.sort as RegistrySearchParams['sort']) || (options.query ? 'relevant' : 'recent'),
          page: Number(options.page) || 1,
          pageSize: Number(options.pageSize) || 30,
        },
        options,
      );
    } catch (error) {
      console.error('List failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('search <query>', 'Search skills in the registry, ranked by relevance')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', { default: DEFAULT_API })
  .option('-c, --category <category>', 'Filter by category')
  .option('-a, --author <handle>', 'Filter by author handle')
  .option('--type <type>', 'Filter by type: basic or meta')
  .option('--tag <tag...>', 'Filter by tag (can be repeated)')
  .option('--sort <sort>', 'Sort order: relevant (default), recent, popular, downloads')
  .option('-p, --page <page>', 'Page number', { default: 1 })
  .option('--page-size <size>', 'Results per page', { default: 30 })
  .option('--json', 'Output raw JSON')
  .option('--web', 'Open the browser registry instead of printing')
  .action(async (query, options) => {
    if (options.web) {
      const url = browseUrl(options.registry as string, {
        q: query,
        category: options.category as string | undefined,
        sort: options.sort as string | undefined,
      });
      console.log(`Opening ${url}`);
      openInBrowser(url);
      return;
    }
    try {
      await runListing(
        {
          query,
          category: options.category as string | undefined,
          author: options.author as string | undefined,
          type: options.type as RegistrySearchParams['type'],
          tags: options.tag as string[] | undefined,
          sort: (options.sort as RegistrySearchParams['sort']) || 'relevant',
          page: Number(options.page) || 1,
          pageSize: Number(options.pageSize) || 30,
        },
        options,
      );
    } catch (error) {
      console.error('Search failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('info <skill>', 'Show full details for a skill, including its dependencies')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', { default: DEFAULT_API })
  .option('--json', 'Output raw JSON')
  .action(async (skillId, options) => {
    const client = createApiClient(apiBase(options.registry as string));
    try {
      const { skill } = await client.getSkill(skillId);
      if (options.json) {
        console.log(JSON.stringify(skill, null, 2));
        return;
      }
      console.log(renderSkillInfo(skill));
      console.log(`\nInstall: npx @dmzagent/skill-builder install ${displayId(skill)}`);
    } catch (error) {
      console.error('Lookup failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('suggest <query>', 'Autocomplete suggestions across skills, tags, and authors')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', { default: DEFAULT_API })
  .option('--limit <n>', 'Maximum suggestions', { default: 8 })
  .option('--ids', 'Print only matching skill ids (one per line) — for shell completion')
  .option('--json', 'Output raw JSON')
  .action(async (query, options) => {
    const client = createApiClient(apiBase(options.registry as string));
    try {
      const result = await client.suggest(query, Number(options.limit) || 8);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (options.ids) {
        result.suggestions.filter((s) => s.kind === 'skill').forEach((s) => console.log(s.value));
        return;
      }
      console.log(renderSuggestions(result.suggestions));
    } catch (error) {
      console.error('Suggest failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

const COMPLETION_SCRIPT = `# skill-builder shell completion (bash/zsh)
# Install:  skill-builder completion >> ~/.bashrc   (then restart your shell)
_skill_builder_complete() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    install|info|fork)
      if [ \${#cur} -ge 2 ]; then
        COMPREPLY=( $(skill-builder suggest --ids "$cur" 2>/dev/null) )
        return 0
      fi
      ;;
  esac
  COMPREPLY=( $(compgen -W "install publish generate sync list search info suggest fork login register completion" -- "$cur") )
}
complete -F _skill_builder_complete skill-builder
`;

cli
  .command('completion', 'Print a bash/zsh completion script (skills, tags, authors)')
  .action(() => {
    console.log(COMPLETION_SCRIPT);
  });

cli
  .command('fork <skill-id>', 'Fork an existing skill')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.dmzagent.com/api',
  })
  .option('-n, --name <name>', 'New name for the forked skill')
  .option('-t, --token <token>', 'Auth token for registry')
  .action(async (rawSkillId, options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);
    if (options.token) client.setToken(options.token as string);
    const skillId = rawSkillId;

    console.log(`Forking skill ${rawSkillId} from ${registry}`);

    try {
      const response = await client.forkSkill(skillId, {
        name: options.name as string | undefined,
      });

      console.log('Forked successfully!');
      const displayId = response.skill.authorHandle ? `@${response.skill.authorHandle}/${response.skill.id}` : response.skill.id;
      console.log(`New skill ID: ${displayId}`);
      console.log(`New skill Name: ${response.skill.name}`);
      console.log(`Forked from: ${rawSkillId}`);
    } catch (error) {
      console.error('Fork failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('login <email>', 'Login to the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.dmzagent.com/api',
  })
  .action(async (email, options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);

    const password = process.env.SKILL_PASSWORD || (await promptPassword());

    try {
      const response = await client.login(email, password);
      console.log('Login successful!');
      console.log(`Handle: @${response.user.handle}`);
      console.log(`User: ${response.user.name} (${response.user.email})`);
      console.log(`Token: ${response.token}`);
      console.log('');
      console.log('Set this token via --token flag or SKILL_TOKEN env var');
    } catch (error) {
      console.error('Login failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('register <handle> <name> <email>', 'Register a new account')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.dmzagent.com/api',
  })
  .action(async (handle, name, email, options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);

    const password = process.env.SKILL_PASSWORD || (await promptPassword());

    try {
      const response = await client.register(name, email, password, handle);
      console.log('Registration successful!');
      console.log(`Handle: @${response.user.handle}`);
      console.log(`User: ${response.user.name} (${response.user.email})`);
      console.log(`Token: ${response.token}`);
      console.log('');
      console.log('Set this token via --token flag or SKILL_TOKEN env var');
    } catch (error) {
      console.error('Registration failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function promptPassword(): Promise<string> {
  const write = (s: string) => process.stdout.write(s);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode?.(true);
    let password = '';
    write('Password: ');
    const onData = (key: Buffer) => {
      const char = key.toString();
      if (char === '\n' || char === '\r' || char === '\r\n') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode?.(false);
        resolve(password);
      } else if (char === '\u0003') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) stdin.setRawMode?.(false);
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        password = password.slice(0, -1);
        write('\b \b');
      } else {
        password += char;
        write('*');
      }
    };
    stdin.on('data', onData);
  });
}

cli.help();
cli.version('0.1.0');
cli.parse();
