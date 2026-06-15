import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { listSkills, saveSkill, forkSkill, createSkillBuilderSession, sendSkillBuilderTurn, executeSkill, login, register, getCurrentUser, setAuthToken, clearAuthToken, getAuthToken, type Skill, type AgentMessage, type User, generateNpxCommand, isUnauthorizedError } from './services/api';
import { renderMarkdown } from './renderMarkdown';
import SkillDetailPage from './pages/SkillDetailPage';

const sampleSkills: Skill[] = [
  {
    id: 'dialogue-flow',
    name: 'Dialogue Flow',
    description: 'Build interactive conversation flows for custom AI assistants.',
    category: 'Conversational',
    tags: ['conversation', 'flow', 'assistant'],
    spec: {
      name: 'Dialogue Flow',
      description: 'Build interactive conversation flows for custom AI assistants.',
      category: 'Conversational',
      tags: ['conversation', 'flow', 'assistant'],
      purpose: 'Create structured conversation flows for AI assistants with branching logic, context management, and guided interactions.',
      instructions: [
        'Define the conversation stages',
        'Specify user intents and expected responses',
        'Set up branching logic for different paths',
        'Add context variables for personalization',
        'Include fallback handling for unexpected inputs',
      ],
      promptTemplate: `You are a dialogue flow manager. Guide the user through a structured conversation.

Current Stage: {{stage}}
Context: {{context}}
User Input: {{input}}

Respond appropriately and indicate the next stage.`,
      examples: [
        { title: 'Onboarding Flow', input: 'Hello', output: "Welcome! Let's get you set up. What's your name?" },
        { title: 'Troubleshooting Flow', input: "My printer isn't working", output: "I'll help you troubleshoot. What's the printer model?" },
      ],
      tests: [],
    },
    markdown: `# Dialogue Flow

## Purpose
Create structured conversation flows for AI assistants with branching logic, context management, and guided interactions.

## Instructions
1. Define the conversation stages
2. Specify user intents and expected responses
3. Set up branching logic for different paths
4. Add context variables for personalization
5. Include fallback handling for unexpected inputs

## Prompt Template
\`\`\`
You are a dialogue flow manager. Guide the user through a structured conversation.

Current Stage: {{stage}}
Context: {{context}}
User Input: {{input}}

Respond appropriately and indicate the next stage.
\`\`\`

## Examples
### Example 1: Onboarding Flow
**Stage**: welcome
**Input**: "Hello"
**Response**: "Welcome! Let's get you set up. What's your name?"

### Example 2: Troubleshooting Flow
**Stage**: diagnose
**Input**: "My printer isn't working"
**Response**: "I'll help you troubleshoot. What's the printer model?"
`,
    author: { id: 'system', name: 'Skill Builder' },
    authorHandle: 'skill-builder',
    forkedFrom: undefined,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
    downloads: 42,
  },
  {
    id: 'extract-entities',
    name: 'Entity Extractor',
    description: 'Create extraction skills for structured data from user input.',
    category: 'Data',
    tags: ['extraction', 'nlp', 'structured-data'],
    spec: {
      name: 'Entity Extractor',
      description: 'Create extraction skills for structured data from user input.',
      category: 'Data',
      tags: ['extraction', 'nlp', 'structured-data'],
      purpose: 'Extract structured entities from unstructured user input.',
      instructions: [
        'Define the entity types to extract',
        'Provide examples for each entity type',
        'Specify output format such as JSON or CSV',
        'Handle ambiguous or missing entities',
        'Include confidence scoring',
      ],
      promptTemplate: `Extract entities from the following text.

Entity Types: {{entityTypes}}
Text: {{input}}

Output as JSON with entity type, value, and confidence.`,
      examples: [
        {
          title: 'Meeting Scheduling',
          input: 'Meet John at 3pm tomorrow at the coffee shop',
          output: '{"entities":[{"type":"person","value":"John","confidence":0.95},{"type":"time","value":"3pm tomorrow","confidence":0.9},{"type":"location","value":"coffee shop","confidence":0.85}]}',
        },
      ],
      tests: [],
    },
    markdown: `# Entity Extractor

## Purpose
Extract structured entities (names, dates, locations, custom types) from unstructured user input.

## Instructions
1. Define the entity types to extract
2. Provide examples for each entity type
3. Specify output format (JSON, CSV, etc.)
4. Handle ambiguous or missing entities
5. Include confidence scoring

## Prompt Template
\`\`\`
Extract entities from the following text.

Entity Types: {{entityTypes}}
Text: {{input}}

Output as JSON with entity type, value, and confidence.
\`\`\`

## Examples
### Example 1: Meeting Scheduling
**Input**: "Meet John at 3pm tomorrow at the coffee shop"
**Output**: {"entities": [{"type": "person", "value": "John", "confidence": 0.95}, {"type": "time", "value": "3pm tomorrow", "confidence": 0.9}, {"type": "location", "value": "coffee shop", "confidence": 0.85}]}
`,
    author: { id: 'system', name: 'Skill Builder' },
    authorHandle: 'skill-builder',
    forkedFrom: undefined,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
    downloads: 28,
  },
];

type EditorState = {
  name: string;
  description: string;
  category: string;
  tags: string;
  markdown: string;
};

const initialEditorState: EditorState = {
  name: '',
  description: '',
  category: 'Conversational',
  tags: '',
  markdown: '',
};


type SkillExample = {
  title?: string;
  input: string;
  output: string;
};

type SkillTest = {
  name: string;
  input: string;
  expected: string;
};

type SkillSpec = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
};

type SkillOperation = {
  type: string;
  value?: unknown;
  [key: string]: unknown;
};

type AgentActivity = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
};

const categoryOptions = [
  'Conversational',
  'Data',
  'Automation',
  'Utilities',
  'Healthcare',
  'Compliance',
  'Coding',
  'Research',
];

const createEmptySkillSpec = (): SkillSpec => ({
  name: '',
  description: '',
  category: 'Conversational',
  tags: [],
  purpose: '',
  instructions: [],
  promptTemplate: '',
  examples: [],
  tests: [],
});

const createInitialActivityLog = (): AgentActivity[] => [
  {
    id: 'ready',
    label: 'Skill Architect ready',
    status: 'done',
    detail: 'Describe the capability. The agent will mutate the skill spec instead of returning markdown.',
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const parseTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.replace(/^[-*]\s+|^\d+\.\s+/, '').trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeExamples = (value: unknown): SkillExample[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return { title: `Example ${index + 1}`, input: item, output: '' };
      }
      if (!isRecord(item)) return null;
      const input = asString(item.input ?? item.userInput ?? item.request);
      const output = asString(item.output ?? item.expectedOutput ?? item.response);
      const title = asString(item.title ?? item.name, `Example ${index + 1}`);
      if (!input && !output) return null;
      return { title, input, output };
    })
    .filter(Boolean) as SkillExample[];
};

const normalizeTests = (value: unknown): SkillTest[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const input = asString(item.input ?? item.given);
      const expected = asString(item.expected ?? item.expectedOutput ?? item.output ?? item.then);
      const name = asString(item.name ?? item.title, `Test ${index + 1}`);
      if (!input && !expected) return null;
      return { name, input, expected };
    })
    .filter((item): item is SkillTest => Boolean(item));
};

const normalizeSkillSpec = (value: unknown, fallback: SkillSpec = createEmptySkillSpec()): SkillSpec => {
  if (!isRecord(value)) return fallback;
  return {
    name: asString(value.name ?? value.title, fallback.name),
    description: asString(value.description ?? value.summary, fallback.description),
    category: asString(value.category ?? value.domain, fallback.category),
    tags: parseTags(value.tags).length ? parseTags(value.tags) : fallback.tags,
    purpose: asString(value.purpose ?? value.goal, fallback.purpose),
    instructions: normalizeStringArray(value.instructions).length
      ? normalizeStringArray(value.instructions)
      : fallback.instructions,
    promptTemplate: asString(
      value.promptTemplate ?? value.prompt_template ?? value.prompt ?? value.template,
      fallback.promptTemplate,
    ),
    examples: normalizeExamples(value.examples).length ? normalizeExamples(value.examples) : fallback.examples,
    tests: normalizeTests(value.tests).length ? normalizeTests(value.tests) : fallback.tests,
  };
};

const getSection = (markdown: string, heading: string) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'));
  return match?.[1]?.trim() ?? '';
};

const stripCodeFence = (value: string) => {
  const match = value.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
  return (match?.[1] ?? value).trim();
};

const specFromMarkdown = (markdown: string, fallback: SkillSpec = createEmptySkillSpec()): SkillSpec => {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const category = markdown.match(/\*\*Category\*\*:\s*(.+)/i)?.[1]?.trim();
  const tags = markdown.match(/\*\*Tags\*\*:\s*(.+)/i)?.[1]?.trim();
  const quotedDescription = markdown.match(/^>\s+(.+)$/m)?.[1]?.trim();
  const purpose = getSection(markdown, 'Purpose');
  const instructionsRaw = getSection(markdown, 'Instructions');
  const promptTemplate = stripCodeFence(getSection(markdown, 'Prompt Template'));
  const examplesRaw = getSection(markdown, 'Examples');
  const testsRaw = getSection(markdown, 'Tests');

  return normalizeSkillSpec(
    {
      name: title ?? fallback.name,
      description: quotedDescription ?? fallback.description,
      category: category ?? fallback.category,
      tags: tags ? parseTags(tags) : fallback.tags,
      purpose: purpose || fallback.purpose,
      instructions: normalizeStringArray(instructionsRaw),
      promptTemplate: promptTemplate || fallback.promptTemplate,
      examples: examplesRaw
        ? [{ title: 'Imported examples', input: examplesRaw, output: '' }]
        : fallback.examples,
      tests: testsRaw
        ? [{ name: 'Imported tests', input: testsRaw, expected: '' }]
        : fallback.tests,
    },
    fallback,
  );
};

const specToMarkdown = (spec: SkillSpec) => {
  const safeTitle = spec.name || 'Untitled Skill';
  const tags = spec.tags.length ? spec.tags.join(', ') : 'draft';
  const instructions = spec.instructions.length
    ? spec.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
    : '- Define the operating instructions for this skill.';
  const examples = spec.examples.length
    ? spec.examples
        .map((example, index) => `### ${example.title || `Example ${index + 1}`}\n**Input**\n\n\`\`\`\n${example.input}\n\`\`\`\n\n**Output**\n\n\`\`\`\n${example.output}\n\`\`\``)
        .join('\n\n')
    : '_No examples generated yet._';
  const tests = spec.tests.length
    ? spec.tests
        .map((test, index) => `### ${test.name || `Test ${index + 1}`}\n**Input**\n\n\`\`\`\n${test.input}\n\`\`\`\n\n**Expected**\n\n\`\`\`\n${test.expected}\n\`\`\``)
        .join('\n\n')
    : '_No tests generated yet._';

  return `# ${safeTitle}\n\n> ${spec.description || 'Draft skill description.'}\n\n**Category**: ${spec.category}\n**Tags**: ${tags}\n\n## Purpose\n${spec.purpose || 'Define what this skill is responsible for producing.'}\n\n## Instructions\n${instructions}\n\n## Prompt Template\n\`\`\`\n${spec.promptTemplate || 'You are a reusable AI skill. Use the provided input to complete the task.\n\nInput: {{input}}'}\n\`\`\`\n\n## Examples\n${examples}\n\n## Tests\n${tests}\n`;
};

const editorFromSpec = (spec: SkillSpec): EditorState => ({
  name: spec.name,
  description: spec.description,
  category: spec.category || 'Conversational',
  tags: spec.tags.join(', '),
  markdown: specToMarkdown(spec),
});

const applySkillOperationsToSpec = (current: SkillSpec, operations: SkillOperation[]) => {
  return operations.reduce((draft, operation) => {
    const type = operation.type;
    const value = operation.value;

    switch (type) {
      case 'replace_spec':
      case 'set_spec':
      case 'set_skill_spec':
        return normalizeSkillSpec(value, draft);
      case 'set_metadata':
        return normalizeSkillSpec({ ...draft, ...(isRecord(value) ? value : {}) }, draft);
      case 'set_name':
        return { ...draft, name: asString(value, draft.name) };
      case 'set_description':
        return { ...draft, description: asString(value, draft.description) };
      case 'set_category':
        return { ...draft, category: asString(value, draft.category) };
      case 'set_tags':
        return { ...draft, tags: parseTags(value) };
      case 'set_purpose':
        return { ...draft, purpose: asString(value, draft.purpose) };
      case 'set_instructions':
        return { ...draft, instructions: normalizeStringArray(value) };
      case 'append_instruction':
        return { ...draft, instructions: [...draft.instructions, asString(value)].filter(Boolean) };
      case 'set_prompt':
      case 'set_prompt_template':
        return { ...draft, promptTemplate: asString(value, draft.promptTemplate) };
      case 'set_examples':
        return { ...draft, examples: normalizeExamples(value) };
      case 'append_example':
        return { ...draft, examples: [...draft.examples, ...normalizeExamples([value])] };
      case 'set_tests':
        return { ...draft, tests: normalizeTests(value) };
      case 'append_test':
        return { ...draft, tests: [...draft.tests, ...normalizeTests([value])] };
      default:
        return draft;
    }
  }, current);
};

const extractJsonPayload = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try fenced JSON next.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {
      // Fall through to object slicing.
    }
  }

  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    try {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    } catch {
      // Ignore invalid object slice.
    }
  }

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    try {
      return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
    } catch {
      // Ignore invalid array slice.
    }
  }

  return null;
};

const payloadLooksLikeSpec = (payload: Record<string, unknown>) =>
  ['name', 'description', 'category', 'purpose', 'instructions', 'promptTemplate', 'prompt_template', 'examples', 'tests'].some((key) => key in payload);

const operationsFromAgentText = (text: string, fallback: SkillSpec): SkillOperation[] => {
  const payload = extractJsonPayload(text);

  if (Array.isArray(payload)) {
    return payload.filter(isRecord).map((operation) => operation as SkillOperation);
  }

  if (isRecord(payload)) {
    if (Array.isArray(payload.operations)) {
      return payload.operations.filter(isRecord).map((operation) => operation as SkillOperation);
    }
    if (isRecord(payload.skillSpec)) {
      return [{ type: 'replace_spec', value: payload.skillSpec }];
    }
    if (isRecord(payload.spec)) {
      return [{ type: 'replace_spec', value: payload.spec }];
    }
    if (payloadLooksLikeSpec(payload)) {
      return [{ type: 'replace_spec', value: payload }];
    }
  }

  const markdown = text.match(/```(?:markdown|md)\s*([\s\S]*?)```/i)?.[1] ?? (text.trim().startsWith('#') ? text : '');
  if (markdown) {
    return [{ type: 'replace_spec', value: specFromMarkdown(markdown, fallback) }];
  }

  return [];
};

const operationLabel = (operation: SkillOperation) => {
  switch (operation.type) {
    case 'replace_spec':
    case 'set_spec':
    case 'set_skill_spec':
      return 'Rebuilt full skill spec';
    case 'set_metadata':
      return 'Generated metadata';
    case 'set_name':
      return 'Set skill name';
    case 'set_description':
      return 'Wrote description';
    case 'set_category':
      return 'Determined category';
    case 'set_tags':
      return 'Generated tags';
    case 'set_purpose':
      return 'Defined purpose';
    case 'set_instructions':
    case 'append_instruction':
      return 'Generated instructions';
    case 'set_prompt':
    case 'set_prompt_template':
      return 'Generated prompt template';
    case 'set_examples':
    case 'append_example':
      return 'Generated examples';
    case 'set_tests':
    case 'append_test':
      return 'Generated tests';
    default:
      return `Applied ${operation.type}`;
  }
};

const operationDetail = (operation: SkillOperation) => {
  if (typeof operation.value === 'string') return operation.value.slice(0, 120);
  if (Array.isArray(operation.value)) return `${operation.value.length} item${operation.value.length === 1 ? '' : 's'}`;
  if (isRecord(operation.value)) return 'Updated structured fields';
  return undefined;
};

const skillArchitectSystemMessage: AgentMessage = {
  role: 'system',
  text: `You are Skill Architect, an agent that mutates a reusable AI Skill AST. Do not write markdown as the primary response. Return strict JSON only.

Return one of these shapes:
{"operations":[{"type":"set_name","value":"..."},{"type":"set_category","value":"..."},{"type":"set_description","value":"..."},{"type":"set_tags","value":["..."]},{"type":"set_purpose","value":"..."},{"type":"set_instructions","value":["..."]},{"type":"set_prompt_template","value":"..."},{"type":"set_examples","value":[{"title":"...","input":"...","output":"..."}]},{"type":"set_tests","value":[{"name":"...","input":"...","expected":"..."}]}]}

Or:
{"skillSpec":{"name":"...","description":"...","category":"...","tags":["..."],"purpose":"...","instructions":["..."],"promptTemplate":"...","examples":[{"title":"...","input":"...","output":"..."}],"tests":[{"name":"...","input":"...","expected":"..."}]}}

The client will replay your operations into React state. The user should see the skill materialize in the UI, not a markdown answer.`,
};

const initialAssistantMessages: AgentMessage[] = [
  skillArchitectSystemMessage,
  {
    role: 'assistant',
    text: 'Describe the capability you want to package. I will update the skill spec directly.',
  },
];

function App() {
  const navigate = useNavigate();
  const navigateToSkill = useCallback((skill: Skill) => {
    sessionStorage.setItem(`skill-${skill.id}`, JSON.stringify(skill));
    navigate(`/skill/${skill.id}`);
  }, [navigate]);

  const [view, setView] = useState<'landing' | 'workspace'>('landing');
  const [skills, setSkills] = useState<Skill[]>(sampleSkills);
  const [selected, setSelected] = useState<string | null>(null);
  const [builderSessionId, setBuilderSessionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(initialEditorState);
  const [skillSpec, setSkillSpec] = useState<SkillSpec>(createEmptySkillSpec());
  const [agentActivity, setAgentActivity] = useState<AgentActivity[]>(createInitialActivityLog());
  const [assistantMessages, setAssistantMessages] = useState<AgentMessage[]>(initialAssistantMessages);
  const assistantMessagesRef = useRef(assistantMessages);
  useEffect(() => { assistantMessagesRef.current = assistantMessages; }, [assistantMessages]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [showRegistry, setShowRegistry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authHandle, setAuthHandle] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const userRef = useRef<User | null>(null);
  const pendingProtectedActionRef = useRef<null | {
    message: string;
    action: () => Promise<void>;
  }>(null);
  const [registrySkills, setRegistrySkills] = useState<Skill[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selected) ?? null,
    [selected, skills],
  );

  const markdownPreview = useMemo(() => renderMarkdown(editor.markdown), [editor.markdown]);

  const visibleAssistantMessages = useMemo(
    () => assistantMessages.filter(m => m.role !== 'system'),
    [assistantMessages],
  );

  const npxCommand = useMemo(
    () => selectedSkill ? generateNpxCommand(selectedSkill) : '',
    [selectedSkill],
  );

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const result = await listSkills();
        if (Array.isArray(result.skills) && result.skills.length > 0) {
          setSkills(result.skills);
        }
      } catch {
        setError('Could not reach the server. Sample skills loaded.');
        setSkills(sampleSkills);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (getAuthToken()) {
      getCurrentUser().then(r => setUser(r.user)).catch(() => clearAuthToken());
    }
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const openAuthGate = useCallback((message: string) => {
    setAuthNotice(message);
    setAuthError('');
    setAuthMode('login');
    setShowAuth(true);
  }, []);

  const runProtectedAction = useCallback(async (
    action: () => Promise<void>,
    message: string,
  ) => {
    if (!userRef.current) {
      pendingProtectedActionRef.current = { action, message };
      openAuthGate(message);
      return;
    }

    try {
      await action();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        clearAuthToken();
        setUser(null);
        userRef.current = null;
        pendingProtectedActionRef.current = { action, message };
        openAuthGate(message);
        return;
      }

      throw err;
    }
  }, [openAuthGate]);

  const commitSkillSpec = useCallback((nextSpec: SkillSpec) => {
    setSkillSpec(nextSpec);
    setEditor(editorFromSpec(nextSpec));
  }, []);

  const updateSkillSpec = useCallback((patch: Partial<SkillSpec>) => {
    setSkillSpec((current) => {
      const nextSpec = normalizeSkillSpec({ ...current, ...patch }, current);
      setEditor(editorFromSpec(nextSpec));
      return nextSpec;
    });
  }, []);

  const resetWorkspace = useCallback(() => {
    const emptySpec = createEmptySkillSpec();
    setSelected(null);
    setBuilderSessionId(null);
    setEditor(initialEditorState);
    setSkillSpec(emptySpec);
    setAssistantMessages(initialAssistantMessages);
    setAgentActivity(createInitialActivityLog());
  }, []);

  const handleCreate = useCallback(() => {
    void runProtectedAction(async () => {
      if (!editor.name || !editor.description || !editor.markdown) return;

      const currentUser = userRef.current;
      if (!currentUser) throw new Error('Authentication required');

      const tags = editor.tags.split(',').map(t => t.trim()).filter(Boolean);
      const specForSave = normalizeSkillSpec({
        ...skillSpec,
        name: editor.name,
        description: editor.description,
        category: editor.category,
        tags,
      }, skillSpec);
      const markdownForSave = specToMarkdown(specForSave);
      const baseId = specForSave.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'untitled';
      const id = skills.some(s => s.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
      const now = new Date().toISOString();
      const newSkill: Skill = {
        id,
        name: specForSave.name,
        description: specForSave.description,
        category: specForSave.category,
        tags: specForSave.tags,
        spec: specForSave,
        markdown: markdownForSave,
        author: { id: currentUser.id, name: currentUser.name },
        authorHandle: currentUser.handle,
        createdAt: now,
        updatedAt: now,
        version: 1,
        downloads: 0,
      };

      try {
        setError(null);
        await saveSkill(newSkill);
        setSkills((prev) => [...prev, newSkill]);
        setSelected(id);
        setAgentActivity((prev) => [...prev, { id: `save-${Date.now()}`, label: 'Saved skill draft', status: 'done', detail: newSkill.name }]);
      } catch (err) {
        if (isUnauthorizedError(err)) throw err;
        setError(err instanceof Error ? err.message : 'Failed to save skill.');
      }
    }, 'Sign in or create an account to save this skill.');
  }, [editor, skillSpec, skills, runProtectedAction]);

  const handleOpenRegistry = useCallback(() => {
    setView('workspace');
    setShowRegistry(true);
  }, []);

  const handleStartAuthoring = useCallback(() => {
    resetWorkspace();
    setView('workspace');
  }, [resetWorkspace]);

  const sendMessage = useCallback(async () => {
    if (!assistantInput.trim() || isLoading) return;

    const requestText = assistantInput.trim();
    const runId = `architect-${Date.now()}`;
    const userMessage: AgentMessage = {
      role: 'user',
      text: requestText,
    };

    setAssistantMessages((prev) => [...prev, userMessage]);
    setAgentActivity((prev) => [
      ...prev,
      { id: `${runId}-intent`, label: 'Interpreting user intent', status: 'running', detail: requestText },
    ]);
    setAssistantInput('');
    setIsLoading(true);
    setError(null);

    try {
      let activeSessionId = builderSessionId;

      if (!activeSessionId) {
        const created = await createSkillBuilderSession({
          skillId: selectedSkill?.id,
          initialSpec: skillSpec,
          intent: requestText,
        });
        activeSessionId = created.session.id;
        setBuilderSessionId(activeSessionId);
      }

      const response = await sendSkillBuilderTurn(activeSessionId, {
        intent: requestText,
        currentSpec: skillSpec,
        selectedSkillId: selectedSkill?.id,
        messages: [userMessage],
        clientMessageId: runId,
      });

      const operations = response.operations ?? [];
      if (operations.length === 0 && !response.spec) {
        throw new Error('The skill-builder session returned no operations and no SkillSpec.');
      }

      setSkillSpec((current) => {
        const nextSpec = response.spec
          ? normalizeSkillSpec(response.spec, current)
          : applySkillOperationsToSpec(current, operations);
        setEditor(editorFromSpec(nextSpec));
        return nextSpec;
      });

      const activityFromServer = Array.isArray(response.activity) ? response.activity : [];
      setAgentActivity((prev) => [
        ...prev.map((item) => item.id === `${runId}-intent` ? { ...item, status: 'done' as const } : item),
        ...(activityFromServer.length > 0
          ? activityFromServer
          : operations.map((operation, index) => ({
              id: `${runId}-op-${index}`,
              label: operationLabel(operation),
              status: 'done' as const,
              detail: operationDetail(operation),
            }))),
      ]);

      setAssistantMessages((prev) => [
        ...prev,
        response.message ?? {
          role: 'assistant',
          text: `Applied ${operations.length} state operation${operations.length === 1 ? '' : 's'} to the skill spec.`,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Skill Architect failed. ${message}`);
      setAgentActivity((prev) => [
        ...prev.map((item) => item.id === `${runId}-intent` ? { ...item, status: 'error' as const, detail: message } : item),
      ]);
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: `Could not apply changes: ${message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [assistantInput, isLoading, builderSessionId, selectedSkill, skillSpec]);

  const handlePublishSkill = useCallback(() => {
    void runProtectedAction(async () => {
      if (!selectedSkill) return;

      try {
        setError(null);
        const tags = editor.tags ? editor.tags.split(',').map(t => t.trim()).filter(Boolean) : selectedSkill.tags;
        const specForSave = normalizeSkillSpec({
          ...skillSpec,
          name: editor.name || selectedSkill.name,
          description: editor.description || selectedSkill.description,
          category: editor.category || selectedSkill.category,
          tags,
        }, selectedSkill.spec);
        const skillToPublish: Skill = {
          ...selectedSkill,
          name: specForSave.name,
          description: specForSave.description,
          category: specForSave.category,
          tags: specForSave.tags,
          spec: specForSave,
          markdown: specToMarkdown(specForSave),
          updatedAt: new Date().toISOString(),
        };
        await saveSkill(skillToPublish);
        alert(`Published "${skillToPublish.name}"

Install with: ${generateNpxCommand(skillToPublish)}`);
      } catch (err) {
        if (isUnauthorizedError(err)) throw err;
        setError('Failed to publish skill.');
      }
    }, 'Sign in or create an account to publish this skill.');
  }, [selectedSkill, editor, skillSpec, runProtectedAction]);

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const result = authMode === 'login'
        ? await login(authEmail, authPassword)
        : await register(authName, authEmail, authPassword, authHandle);

      setAuthToken(result.token);
      userRef.current = result.user;
      setUser(result.user);

      setShowAuth(false);
      setAuthNotice('');
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      setAuthHandle('');

      const pending = pendingProtectedActionRef.current;
      pendingProtectedActionRef.current = null;

      if (pending) {
        queueMicrotask(() => {
          void runProtectedAction(pending.action, pending.message);
        });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setAuthLoading(false);
    }
  }, [authMode, authEmail, authPassword, authName, authHandle, runProtectedAction]);

  const handleLogout = useCallback(() => {
    clearAuthToken();
    userRef.current = null;
    pendingProtectedActionRef.current = null;
    setAuthNotice('');
    setUser(null);
  }, []);

  useEffect(() => {
    if (!showRegistry) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setRegistryLoading(true);
      try {
        const result = await listSkills({
          query: searchQuery || undefined,
          category: searchCategory || undefined,
          sort: 'popular',
          signal: abort.signal,
        });
        if (!abort.signal.aborted) setRegistrySkills(result.skills);
      } catch (err) {
        if (!abort.signal.aborted) setError('Failed to load registry.');
      } finally {
        if (!abort.signal.aborted) setRegistryLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [showRegistry, searchQuery, searchCategory]);

  const handleExecuteSkill = useCallback(async () => {
    if (!selectedSkill || !assistantInput.trim() || isLoading) return;

    const userMessage: AgentMessage = { role: 'user', text: assistantInput.trim() };
    setAssistantMessages((prev) => [...prev, userMessage]);
    setAssistantInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await executeSkill(selectedSkill.id, { input: userMessage.text, taskOutline: 'Execute skill.' });
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: response.response }]);
    } catch (err) {
      setError('Skill execution failed.');
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSkill, assistantInput, isLoading]);

  const handleLoadSkill = useCallback((skill: Skill) => {
    const fallbackSpec = normalizeSkillSpec({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags,
    });
    const importedSpec = normalizeSkillSpec(skill.spec, fallbackSpec);
    commitSkillSpec(importedSpec);
    setSelected(skill.id);
    setAgentActivity((prev) => [
      ...prev,
      { id: `load-${skill.id}-${Date.now()}`, label: 'Loaded skill into architect', status: 'done', detail: skill.name },
    ]);
  }, [commitSkillSpec]);

  const handleForkSkill = useCallback(() => {
    void runProtectedAction(async () => {
      if (!selectedSkill) return;

      try {
        setError(null);
        const result = await forkSkill(selectedSkill.id);
        setSkills((prev) => [...prev, result.skill]);
        setSelected(result.skill.id);
        handleLoadSkill(result.skill);
      } catch (err) {
        if (isUnauthorizedError(err)) throw err;
        setError('Fork failed.');
      }
    }, 'Sign in or create an account to fork this skill.');
  }, [selectedSkill, handleLoadSkill, runProtectedAction]);

  const handleGoHome = useCallback(() => setView('landing'), []);

  return (
    <Routes>
      <Route path="/skill/:scope/:skillSlug" element={<SkillDetailPage />} />
      <Route path="/skill/:skillId" element={<SkillDetailPage />} />
      <Route path="*" element={
    <div className="min-h-screen font-body text-stone-900 bg-[#f5f0eb]">
      {view === 'landing' ? (
        <div className="mx-auto max-w-6xl px-6 py-12">
          <header className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold tracking-tight text-stone-800">skill builder</span>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-stone-500">{user.name}</span>
                <button onClick={handleLogout} className="text-sm text-stone-400 hover:text-stone-700">Sign out</button>
              </div>
            ) : (
              <button onClick={() => { setAuthNotice(''); setShowAuth(true); }} className="text-sm font-medium text-stone-700 hover:text-stone-900">Sign in</button>
            )}
          </header>

          <main>
            <section className="mt-24 mb-14 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <p className="mb-5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Open-source skill registry &amp; runtime
                </p>
                <h1 className="font-display text-5xl sm:text-6xl font-light leading-[1.05] tracking-tight text-stone-900">
                  Reusable AI skills<br />
                  <span className="italic font-normal text-amber-700">for agents and teams</span>.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
                  Discover, install, author, and execute portable AI capabilities that agents, workflows, and applications can use on demand.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={() => { handleOpenRegistry(); }}
                    className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
                  >
                    Browse Registry &rarr;
                  </button>
                  <button
                    onClick={handleStartAuthoring}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-amber-500 hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-amber-600"
                  >
                    Build a Skill
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-950 p-6 text-stone-100 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-amber-300">Example Skill</span>
                  <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Verified</span>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 font-mono text-xs leading-6 text-stone-200">{`{
  "name": "Email Classifier",
  "category": "Automation",
  "tags": ["email", "routing"],
  "purpose": "Classify inbound emails into queues.",
  "promptTemplate": "Input: {{email}}",
  "tests": ["routes billing escalations"]
}`}</pre>
                <div className="mt-4 rounded-xl bg-stone-900 px-4 py-3 font-mono text-xs text-amber-200">
                  npx @concordex-ai/skill-builder install email-classifier
                </div>
              </div>
            </section>
          </main>

          <div className="grid gap-8 lg:grid-cols-3">
            <div className="group relative rounded-2xl border border-stone-200 bg-white p-8 transition-all hover:shadow-lg hover:-translate-y-0.5">
              <h2 className="font-display text-3xl font-semibold italic text-amber-600">Browse</h2>
              <hr className="mt-4 w-12 border-stone-200" />
              <p className="mt-5 text-base leading-relaxed text-stone-600">
                Find ready-to-use skills in the registry. Compare authors, categories, versions, and install commands.
              </p>
              <button
                onClick={() => { handleOpenRegistry(); }}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Open Registry &rarr;
              </button>
            </div>

            <div className="group relative rounded-2xl border border-stone-200 bg-white p-8 transition-all hover:shadow-lg hover:-translate-y-0.5">
              <h2 className="font-display text-3xl font-semibold italic text-amber-600">Author</h2>
              <hr className="mt-4 w-12 border-stone-200" />
              <p className="mt-5 text-base leading-relaxed text-stone-600">
                Build custom skills from scratch. Use the Skill Architect to turn intent into a structured SkillSpec AST.
              </p>
              <button
                onClick={handleStartAuthoring}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Open Architect &rarr;
              </button>
            </div>

            <div className="group relative rounded-2xl border border-stone-200 bg-white p-8 transition-all hover:shadow-lg hover:-translate-y-0.5">
              <h2 className="font-display text-3xl font-semibold italic text-amber-600">Execute</h2>
              <hr className="mt-4 w-12 border-stone-200" />
              <p className="mt-5 text-base leading-relaxed text-stone-600">
                Load a skill, provide input, and run it through the assistant to validate behavior before publishing.
              </p>
              <button
                onClick={() => { handleOpenRegistry(); }}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Choose a Skill &rarr;
              </button>
            </div>
          </div>
        </div>
      ) : (
        <main className="mx-auto max-w-7xl px-6 py-6">
          <header className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handleGoHome} className="font-display text-base font-semibold text-stone-700 hover:text-amber-600 transition">&larr; skill builder</button>
              {selectedSkill && (
                <span className="hidden sm:inline text-sm text-stone-400">/ {selectedSkill.name}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowRegistry(true)} className="text-sm font-medium text-stone-600 hover:text-stone-800 transition">Browse</button>
              {user ? (
                <div className="flex items-center gap-2 pl-3 border-l border-stone-200">
                  <span className="text-sm text-stone-500">{user.name}</span>
                  <button onClick={handleLogout} className="text-xs text-stone-400 hover:text-stone-700">Sign out</button>
                </div>
              ) : (
                <button onClick={() => { setAuthNotice(''); setShowAuth(true); }} className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600">Sign in</button>
              )}
            </div>
          </header>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <aside className="rounded-2xl border border-stone-200 bg-white p-5 flex min-h-[680px] flex-col">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-600">Agent-first builder</p>
                <h2 className="mt-1 font-display text-2xl font-normal text-stone-900">Skill Architect</h2>
                <p className="mt-2 text-xs leading-relaxed text-stone-400">
                  The agent emits operations. The client replays them into the SkillSpec and the workspace updates.
                </p>
              </div>

              <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Build pipeline</p>
                <div className="mt-3 space-y-2">
                  {agentActivity.slice(-8).map((item) => (
                    <div key={item.id} className="flex gap-2 text-sm">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        item.status === 'done'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'running'
                            ? 'bg-amber-100 text-amber-700 animate-pulse'
                            : item.status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-stone-100 text-stone-400'
                      }`}>
                        {item.status === 'done' ? '✓' : item.status === 'error' ? '!' : '•'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-stone-700">{item.label}</p>
                        {item.detail && <p className="truncate text-xs text-stone-400">{item.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-stone-100 bg-stone-50 p-3">
                {visibleAssistantMessages.map((msg, i) => (
                  <div key={i} className={`rounded-xl p-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-white text-stone-700 shadow-sm'
                      : 'bg-stone-900 text-stone-100'
                  }`}>
                    <p className={`mb-1 text-xs font-medium ${msg.role === 'user' ? 'text-stone-400' : 'text-stone-400'}`}>
                      {msg.role === 'user' ? 'You' : 'Architect'}
                    </p>
                    <p className="whitespace-pre-line">{msg.text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <textarea
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Build a skill that extracts Medicare billing codes from physician notes..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={sendMessage}
                    disabled={isLoading}
                    className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Building...' : 'Build / update skill'}
                  </button>
                  {selectedSkill && (
                    <button
                      onClick={handleExecuteSkill}
                      disabled={isLoading || !assistantInput.trim()}
                      className="rounded-xl border border-stone-200 px-3 py-2.5 text-xs font-medium text-stone-500 transition hover:border-stone-400 disabled:opacity-40"
                    >
                      Run
                    </button>
                  )}
                </div>
              </div>
            </aside>

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Current SkillSpec</p>
                  <h1 className="mt-1 font-display text-3xl font-normal text-stone-900">
                    {skillSpec.name || 'Untitled skill'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
                    {skillSpec.description || 'The architect will fill this in as soon as the user describes the desired capability.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleCreate} className="rounded-full bg-amber-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-700">Save</button>
                  <button onClick={handlePublishSkill} disabled={!selectedSkill} className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 disabled:opacity-40">Publish</button>
                  {selectedSkill && (
                    <button onClick={handleForkSkill} className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400">Fork</button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Name</span>
                  <input
                    value={skillSpec.name}
                    onChange={(e) => updateSkillSpec({ name: e.target.value })}
                    placeholder="Medicare Billing Extractor"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Category</span>
                  <select
                    value={skillSpec.category}
                    onChange={(e) => updateSkillSpec({ category: e.target.value })}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  >
                    {categoryOptions.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Tags</span>
                  <input
                    value={skillSpec.tags.join(', ')}
                    onChange={(e) => updateSkillSpec({ tags: parseTags(e.target.value) })}
                    placeholder="cms, billing, medical"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-1.5 text-sm">
                <span className="font-medium text-stone-700">Description</span>
                <textarea
                  value={skillSpec.description}
                  onChange={(e) => updateSkillSpec({ description: e.target.value })}
                  placeholder="Brief description of what this skill does"
                  rows={2}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Purpose</span>
                  <textarea
                    value={skillSpec.purpose}
                    onChange={(e) => updateSkillSpec({ purpose: e.target.value })}
                    placeholder="What job should this skill own?"
                    rows={7}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Instructions</span>
                  <textarea
                    value={skillSpec.instructions.join('\n')}
                    onChange={(e) => updateSkillSpec({ instructions: normalizeStringArray(e.target.value) })}
                    placeholder={'Identify the user intent\nExtract required fields\nReturn structured JSON'}
                    rows={7}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
              </div>

              <label className="mt-4 block space-y-1.5 text-sm">
                <span className="font-medium text-stone-700">Prompt Template</span>
                <textarea
                  value={skillSpec.promptTemplate}
                  onChange={(e) => updateSkillSpec({ promptTemplate: e.target.value })}
                  placeholder={'You are a reusable AI skill.\n\nInput: {{input}}\nOutput format: {{format}}'}
                  rows={8}
                  className="w-full rounded-xl border border-stone-200 bg-stone-950 px-4 py-3 font-mono text-sm text-stone-100 outline-none transition focus:border-amber-500 resize-y"
                  spellCheck={false}
                />
              </label>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-700">Examples</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-400">{skillSpec.examples.length}</span>
                  </div>
                  <div className="space-y-3">
                    {skillSpec.examples.length ? skillSpec.examples.map((example, index) => (
                      <div key={`${example.title}-${index}`} className="rounded-xl bg-white p-3 text-xs shadow-sm">
                        <p className="font-semibold text-stone-700">{example.title || `Example ${index + 1}`}</p>
                        <p className="mt-2 text-stone-400">Input</p>
                        <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-stone-600">{example.input}</pre>
                        <p className="mt-2 text-stone-400">Output</p>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-stone-600">{example.output}</pre>
                      </div>
                    )) : <p className="text-sm text-stone-400">No examples yet. Ask the architect to generate edge-case examples.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-700">Tests</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-400">{skillSpec.tests.length}</span>
                  </div>
                  <div className="space-y-3">
                    {skillSpec.tests.length ? skillSpec.tests.map((test, index) => (
                      <div key={`${test.name}-${index}`} className="rounded-xl bg-white p-3 text-xs shadow-sm">
                        <p className="font-semibold text-stone-700">{test.name || `Test ${index + 1}`}</p>
                        <p className="mt-2 text-stone-400">Input</p>
                        <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-stone-600">{test.input}</pre>
                        <p className="mt-2 text-stone-400">Expected</p>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-stone-600">{test.expected}</pre>
                      </div>
                    )) : <p className="text-sm text-stone-400">No tests yet. Ask for validation cases before publishing.</p>}
                  </div>
                </div>
              </div>
            </section>

            <aside className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Generated artifacts</p>
                <h2 className="mt-1 font-display text-2xl font-normal text-stone-900">Runtime package</h2>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs text-stone-400">Fields</p>
                  <p className="mt-1 text-lg font-semibold text-stone-800">
                    {[skillSpec.name, skillSpec.description, skillSpec.purpose, skillSpec.promptTemplate].filter(Boolean).length}/4
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-xs text-stone-400">Artifacts</p>
                  <p className="mt-1 text-lg font-semibold text-stone-800">{skillSpec.examples.length + skillSpec.tests.length}</p>
                </div>
              </div>

              {selectedSkill && (
                <div className="mb-4 rounded-xl bg-stone-950 px-4 py-3 font-mono text-xs text-amber-200">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-stone-400">Install</span>
                    <button onClick={() => navigator.clipboard.writeText(npxCommand)} className="font-sans font-medium text-white hover:text-amber-200">Copy</button>
                  </div>
                  <code className="break-all">{npxCommand}</code>
                </div>
              )}

              <div className="mb-3 flex items-center gap-2">
                {(['edit', 'split', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEditorMode(mode)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      editorMode === mode
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    {mode === 'edit' ? 'Source' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>

              <div className={`grid gap-3 ${editorMode === 'split' ? 'grid-cols-1' : 'grid-cols-1'}`}>
                {editorMode !== 'preview' && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-stone-400">Generated markdown</span>
                    <textarea
                      value={editor.markdown}
                      onChange={(e) => setEditor((cur) => ({ ...cur, markdown: e.target.value }))}
                      className="h-[280px] w-full rounded-xl border border-stone-200 bg-stone-950 px-4 py-3 font-mono text-xs text-stone-100 outline-none transition focus:border-amber-500 resize-y"
                      spellCheck={false}
                    />
                  </div>
                )}
                {editorMode !== 'edit' && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-stone-400">Preview</span>
                    <div className="max-h-[360px] min-h-[280px] overflow-y-auto rounded-xl border border-stone-200 bg-white px-4 py-3 prose prose-stone prose-sm max-w-none">
                      {markdownPreview}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      )}

      {showRegistry && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/60 pt-12 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-5xl max-h-[85vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-8 py-5">
              <div>
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Registry</p>
                <h2 className="mt-0.5 font-display text-2xl font-normal text-stone-900">Browse skills</h2>
              </div>
              <button onClick={() => setShowRegistry(false)} className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-200">Close</button>
            </div>

            <div className="border-b border-stone-200 px-8 py-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, tag, or description..."
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                />
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-5 py-2.5 text-sm outline-none transition focus:border-amber-500 sm:w-44"
                >
                  <option value="">All categories</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Data">Data</option>
                  <option value="Automation">Automation</option>
                  <option value="Utilities">Utilities</option>
                </select>
              </div>
            </div>

            <div className="px-8 py-6">
              {registryLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                </div>
              ) : registrySkills.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-base text-stone-400">No skills found</p>
                  <p className="mt-1 text-sm text-stone-300">Try adjusting your search.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {registrySkills.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => navigateToSkill(skill)}
                      className="group rounded-xl border border-stone-200 bg-stone-50 p-5 text-left transition hover:border-amber-500/40 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-base font-semibold text-stone-800 group-hover:text-amber-700">{skill.name}</h3>
                        <span className="shrink-0 rounded-full bg-stone-200 px-2.5 py-0.5 text-xs text-stone-500">{skill.category}</span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-stone-500 line-clamp-2">{skill.description}</p>
                      {skill.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {skill.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-stone-200/50 px-2 py-0.5 text-xs text-stone-400">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 font-mono text-xs text-stone-400">
                        {generateNpxCommand(skill)}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-stone-400">
                        <span>{skill.downloads ?? 0} downloads</span>
                        <span>v{skill.version}</span>
                        <span>{skill.author?.name ?? 'Unknown'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-8 py-5">
              <h2 className="font-display text-xl font-normal text-stone-900">{authMode === 'login' ? 'Sign in' : 'Create account'}</h2>
              <button onClick={() => setShowAuth(false)} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-500 transition hover:bg-stone-200">Close</button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4 px-8 py-6">
              {authNotice && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{authNotice}</div>
              )}
              {authError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{authError}</div>
              )}
              {authMode === 'register' && (
                <>
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-stone-700">Name</span>
                    <input value={authName} onChange={e => setAuthName(e.target.value)} required
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white" />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="font-medium text-stone-700">Handle</span>
                    <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50 px-4 transition focus-within:border-amber-500 focus-within:bg-white">
                      <span className="text-stone-400">@</span>
                      <input value={authHandle} onChange={e => setAuthHandle(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} required
                        placeholder="skillauthor"
                        className="w-full bg-transparent py-2.5 text-sm outline-none" />
                    </div>
                    <p className="text-xs text-stone-400">Letters, numbers, hyphens, underscores</p>
                  </label>
                </>
              )}
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-stone-700">Email</span>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white" />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-stone-700">Password</span>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white" />
              </label>
              <button type="submit" disabled={authLoading}
                className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50">
                {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign in' : 'Create account'}
              </button>
              <p className="text-center text-sm text-stone-400">
                {authMode === 'login' ? (
                  <>Don&rsquo;t have an account? <button type="button" onClick={() => { setAuthMode('register'); setAuthError(''); }} className="text-amber-600 hover:underline">Register</button></>
                ) : (
                  <>Already have an account? <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-amber-600 hover:underline">Sign in</button></>
                )}
              </p>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-stone-200 bg-white mt-16">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-stone-400">skill builder &mdash; open-source skill registry &amp; architect</p>
          <nav className="flex items-center gap-6">
            <a href="https://github.com/praeceptor-thesis/skill-builder-landing" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">GitHub</a>
            <a href="https://github.com/praeceptor-thesis/skill-builder-landing?tab=readme-ov-file#readme" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">Docs</a>
            <a href="https://www.npmjs.com/package/@concordex-ai/skill-builder" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">npm</a>
          </nav>
        </div>
      </footer>
    </div>
      } />
    </Routes>
  );
}

export default App;
