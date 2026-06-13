#!/usr/bin/env node
import cac from 'cac';

const cli = cac('skill-builder');

type SkillConfig = {
  name: string;
  version: string;
  registryUrl: string;
  description?: string;
};

const suggest = (text: string) => `skill-builder ${text}`;

cli
  .command('install <skill>', 'Install a skill package from the registry')
  .option('-r, --registry <url>', 'Registry URL', {
    default: 'https://registry.example.com',
  })
  .option('-v, --version <version>', 'Skill version', {
    default: 'latest',
  })
  .action(async (skill, options) => {
    const registry = options.registry as string;
    const version = options.version as string;

    console.log(`Installing skill ${skill}@${version} from ${registry}`);
    console.log('Fetching metadata...');

    try {
      const response = await fetch(`${registry}/skills/${skill}/${version}`);
      if (!response.ok) {
        throw new Error(`Registry returned ${response.status}`);
      }
      const metadata = await response.json();
      console.log('Skill metadata:');
      console.log(JSON.stringify(metadata, null, 2));
      console.log('Simulating installation into Frontier model configuration...');
      console.log(`Added skill ${metadata.name}@${metadata.version} to frontier.config.json`);
    } catch (error) {
      console.error('Install failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

cli
  .command('publish <path>', 'Publish a local skill to the registry')
  .option('-r, --registry <url>', 'Registry URL', {
    default: 'https://registry.example.com',
  })
  .action(async (path, options) => {
    const registry = options.registry as string;
    console.log(`Publishing skill from ${path} to ${registry}`);
    console.log('Packaging skill manifest...');
    console.log('Published successfully (simulation).');
  });

cli.help();
cli.version('0.1.0');
cli.parse();
