#!/usr/bin/env node
import cac from 'cac';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { createApiClient, type Skill, type SkillPayload } from './api/client.js';

const cli = cac('skill-builder');

cli
  .command('install <skill>', 'Install a skill package from the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.eastern-shore-solutions.com/api',
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
  .action(async (skill, options) => {
    const registry = options.registry as string;
    const outputDir = options.output as string;
    const tool = (options.tool as string) || 'file';
    const agentsFile = options.agentsFile as string;
    const client = createApiClient(registry);
    const skillId = skill;

    console.log(`Installing skill ${skill} from ${registry} [--tool ${tool}]`);

    try {
      const response = await client.getSkill(skillId);
      const metadata = response.skill;
      const fileName = metadata.id.startsWith('@') ? metadata.id.slice(metadata.id.indexOf('/') + 1) : metadata.id;

      switch (tool) {
        case 'claude':
        case 'codex': {
          const filePath = path.resolve(agentsFile);
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

          const heading = `## ${metadata.name}`;
          const description = metadata.description ? `> ${metadata.description}\n` : '';
          const preamble = `\n\n${heading}\n${description}\n<!-- skill-id: ${metadata.id} -->\n`;

          if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath, 'utf-8');
            if (existing.includes(`<!-- skill-id: ${metadata.id} -->`)) {
              console.log(`Skill "${metadata.name}" already installed in ${filePath}.`);
              return;
            }
            fs.appendFileSync(filePath, preamble + metadata.markdown, 'utf-8');
          } else {
            fs.writeFileSync(filePath, preamble + metadata.markdown, 'utf-8');
          }
          console.log(`Installed "${metadata.name}" into ${filePath}`);
          break;
        }

        case 'cursor': {
          const rulesDir = path.resolve('.cursor/rules');
          if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

          const mdcPath = path.join(rulesDir, `${fileName}.mdc`);
          const frontmatter = [
            '---',
            `description: ${metadata.description || metadata.name}`,
            'globs: *',
            '---',
            '',
          ].join('\n');

          fs.writeFileSync(mdcPath, frontmatter + metadata.markdown, 'utf-8');
          console.log(`Installed "${metadata.name}" into ${mdcPath}`);
          break;
        }

        default: {
          const outDir = path.resolve(outputDir);
          if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

          const outPath = path.join(outDir, `${fileName}.md`);
          fs.writeFileSync(outPath, metadata.markdown, 'utf-8');
          console.log(`Skill markdown written to: ${outPath}`);

          const configPath = path.join(outDir, `${fileName}.json`);
          const config = {
            id: metadata.id,
            name: metadata.name,
            description: metadata.description,
            category: metadata.category,
            tags: metadata.tags,
            version: metadata.version,
            author: metadata.author,
          };
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
          console.log(`Skill config written to: ${configPath}`);
          break;
        }
      }

      console.log('Skill installed successfully.');
    } catch (error) {
      console.error('Install failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('publish <path>', 'Publish a local skill to the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.eastern-shore-solutions.com/api',
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
  .command('list', 'List all skills from the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.eastern-shore-solutions.com/api',
  })
  .option('-q, --query <query>', 'Search query')
  .option('-c, --category <category>', 'Filter by category')
  .option('--tag <tag...>', 'Filter by tag (can be repeated)')
  .option('--sort <sort>', 'Sort order: recent, popular, downloads')
  .action(async (options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);

    try {
      const response = await client.listSkills({
        query: options.query as string | undefined,
        category: options.category as string | undefined,
        tags: options.tag as string[] | undefined,
        sort: options.sort as 'recent' | 'popular' | 'downloads' | undefined,
      });

      if (response.skills.length === 0) {
        console.log('No skills found.');
        return;
      }

      console.log(`Found ${response.total || response.skills.length} skills:`);
      console.log('');
      response.skills.forEach((skill) => {
        const tags = skill.tags?.length ? ` [${skill.tags.join(', ')}]` : '';
        const downloads = skill.downloads != null ? ` ⬇ ${skill.downloads}` : '';
        const displayId = skill.id.startsWith('@') ? skill.id : skill.authorHandle ? `@${skill.authorHandle}/${skill.id}` : skill.id;
        console.log(`  ${displayId.padEnd(35)} ${skill.name.padEnd(25)} ${skill.category.padEnd(16)} v${skill.version || 1}${downloads}${tags}`);
      });
    } catch (error) {
      console.error('List failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('search <query>', 'Search skills in the registry')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.eastern-shore-solutions.com/api',
  })
  .option('-c, --category <category>', 'Filter by category')
  .option('--tag <tag...>', 'Filter by tag (can be repeated)')
  .option('--sort <sort>', 'Sort order: recent, popular, downloads')
  .action(async (query, options) => {
    const registry = options.registry as string;
    const client = createApiClient(registry);

    try {
      const response = await client.listSkills({
        query,
        category: options.category as string | undefined,
        tags: options.tag as string[] | undefined,
        sort: options.sort as 'recent' | 'popular' | 'downloads' | undefined,
      });

      if (response.skills.length === 0) {
        console.log(`No skills found matching "${query}".`);
        return;
      }

      console.log(`Found ${response.total || response.skills.length} skills matching "${query}":`);
      console.log('');
      response.skills.forEach((skill) => {
        const displayId = skill.id.startsWith('@') ? skill.id : skill.authorHandle ? `@${skill.authorHandle}/${skill.id}` : skill.id;
        console.log(`  ${displayId}`);
        console.log(`    Name:        ${skill.name}`);
        console.log(`    Category:    ${skill.category}`);
        console.log(`    Downloads:   ${skill.downloads || 0}`);
        console.log(`    Version:     v${skill.version || 1}`);
        if (skill.tags?.length) console.log(`    Tags:        ${skill.tags.join(', ')}`);
        if (skill.description) console.log(`    Description: ${skill.description}`);
        console.log('');
      });
    } catch (error) {
      console.error('Search failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('fork <skill-id>', 'Fork an existing skill')
  .option('-r, --registry <url>', 'Registry URL (Worker API)', {
    default: 'https://skills.eastern-shore-solutions.com/api',
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
    default: 'https://skills.eastern-shore-solutions.com/api',
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
    default: 'https://skills.eastern-shore-solutions.com/api',
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
