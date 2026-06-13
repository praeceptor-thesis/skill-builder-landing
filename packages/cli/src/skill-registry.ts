export type SkillRegistryEntry = {
  name: string;
  version: string;
  description: string;
  homepage?: string;
  commands?: string[];
};

export const mockRegistry: SkillRegistryEntry[] = [
  {
    name: 'dialogue-flow',
    version: '1.0.0',
    description: 'Conversational orchestration skill with branching prompts.',
    homepage: 'https://example.com/skills/dialogue-flow',
  },
  {
    name: 'extract-entities',
    version: '1.1.0',
    description: 'Extract structured entities from user prompts.',
    homepage: 'https://example.com/skills/extract-entities',
  },
];
