import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { listSkills, saveSkill, forkSkill, createSkillBuilderSession, sendSkillBuilderTurn, login, register, getCurrentUser, setAuthToken, clearAuthToken, getAuthToken, suggestSkills, type Skill, type AgentMessage, type User, type RegistryTaxonomy, type SkillSuggestion, type SkillType, generateNpxCommand, isUnauthorizedError } from './services/api';
import { renderMarkdown } from './renderMarkdown';
import SkillDetailPage from './pages/SkillDetailPage';
import SkillStudio from './components/SkillStudio';
import type { AgentActivity } from './components/ArchitectPanel';
import {
  applySkillOperationsToSpec,
  createEmptySkillSpec,
  normalizeSkillSpec,
  operationDetail,
  operationLabel,
  qualifyDependencies,
  specFromMarkdown,
  specToMarkdown,
  type SkillSpec,
} from './skill/spec';

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


const createInitialActivityLog = (): AgentActivity[] => [
  {
    id: 'ready',
    label: 'Skill Architect ready',
    status: 'done',
    detail: 'Describe the capability. The agent will mutate the skill spec instead of returning markdown.',
  },
];

const editorFromSpec = (spec: SkillSpec): EditorState => ({
  name: spec.name,
  description: spec.description,
  category: spec.category || 'Conversational',
  tags: spec.tags.join(', '),
  markdown: specToMarkdown(spec),
});

const skillArchitectSystemMessage: AgentMessage = {
  role: 'system',
  text: `You are Skill Architect, an agent that mutates a reusable AI Skill AST. Do not write markdown as the primary response. Return strict JSON only.

Return one of these shapes:
{"operations":[{"type":"set_name","value":"..."},{"type":"set_category","value":"..."},{"type":"set_description","value":"..."},{"type":"set_tags","value":["..."]},{"type":"set_purpose","value":"..."},{"type":"set_instructions","value":["..."]},{"type":"set_prompt_template","value":"..."},{"type":"set_examples","value":[{"title":"...","input":"...","output":"..."}]},{"type":"set_tests","value":[{"name":"...","input":"...","expected":"..."}]},{"type":"set_capabilities","value":[{"id":"tool-use","level":"required","note":"..."}]}]}

Or:
{"skillSpec":{"name":"...","description":"...","category":"...","tags":["..."],"purpose":"...","instructions":["..."],"promptTemplate":"...","examples":[{"title":"...","input":"...","output":"..."}],"tests":[{"name":"...","input":"...","expected":"..."}],"capabilities":[{"id":"vision","level":"required"}]}}

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
  const [registryPage, setRegistryPage] = useState(1);
  const [registryTotal, setRegistryTotal] = useState(0);
  const [registryHasMore, setRegistryHasMore] = useState(false);
  const [taxonomy, setTaxonomy] = useState<RegistryTaxonomy | null>(null);
  const [searchAuthor, setSearchAuthor] = useState('');
  const [searchType, setSearchType] = useState<SkillType | ''>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [registrySort, setRegistrySort] = useState<'relevant' | 'recent' | 'popular' | 'downloads'>('popular');
  const [denseView, setDenseView] = useState(false);
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const REGISTRY_PAGE_SIZE = 50;
  const toggleSearchTag = useCallback((tag: string) => {
    setSearchTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

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
      if (!editor.name.trim() || !editor.description.trim()) {
        // Saving silently did nothing before; say which field is holding it up.
        setError('A name and a description are required before saving. Add them in Settings → Identity.');
        return;
      }

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
      specForSave.dependencies = qualifyDependencies(specForSave.dependencies, currentUser.handle);
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
        type: specForSave.type,
        dependencies: specForSave.dependencies,
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
        // The registry scopes the id to the owner's handle (`@handle/slug`) and
        // is the authority on the stored record — keep what it returns, or the
        // workspace holds an id that no read path (execute included) resolves.
        const response = await saveSkill(newSkill);
        const persisted = response?.skill ?? newSkill;
        setSkills((prev) => [...prev.filter((skill) => skill.id !== persisted.id), persisted]);
        setSelected(persisted.id);
        setAgentActivity((prev) => [...prev, { id: `save-${Date.now()}`, label: 'Saved skill draft', status: 'done', detail: persisted.name }]);
      } catch (err) {
        if (isUnauthorizedError(err)) throw err;
        setError(err instanceof Error ? err.message : 'Failed to save skill.');
      }
    }, 'Sign in or create an account to save this skill.');
  }, [editor, skillSpec, skills, runProtectedAction]);

  const handleApplyMarkdown = useCallback(() => {
    commitSkillSpec(specFromMarkdown(editor.markdown, skillSpec));
  }, [commitSkillSpec, editor.markdown, skillSpec]);

  const handleInspectSkill = useCallback((skillId: string) => {
    const known = skills.find((skill) => skill.id === skillId);
    if (known) {
      navigateToSkill(known);
      return;
    }
    setSearchQuery(skillId);
    setShowRegistry(true);
  }, [skills, navigateToSkill]);

  const handleOpenRegistry = useCallback(() => {
    setView('workspace');
    setShowRegistry(true);
  }, []);

  const handleStartAuthoring = useCallback(() => {
    resetWorkspace();
    setView('workspace');
  }, [resetWorkspace]);

  const sendMessage = useCallback(async (text?: string) => {
    const requestText = (text ?? assistantInput).trim();
    if (!requestText || isLoading) return;

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
    if (text === undefined) setAssistantInput('');
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
        specForSave.dependencies = qualifyDependencies(specForSave.dependencies, selectedSkill.authorHandle || userRef.current?.handle);
        const skillToPublish: Skill = {
          ...selectedSkill,
          name: specForSave.name,
          description: specForSave.description,
          category: specForSave.category,
          tags: specForSave.tags,
          type: specForSave.type,
          dependencies: specForSave.dependencies,
          spec: specForSave,
          markdown: specToMarkdown(specForSave),
          updatedAt: new Date().toISOString(),
        };
        const response = await saveSkill(skillToPublish);
        const persisted = response?.skill ?? skillToPublish;
        setSkills((prev) => [...prev.filter((skill) => skill.id !== persisted.id), persisted]);
        setSelected(persisted.id);
        alert(`Published "${persisted.name}"

Install with: ${generateNpxCommand(persisted)}`);
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
    const sort = searchQuery ? registrySort : (registrySort === 'relevant' ? 'popular' : registrySort);
    const timer = setTimeout(async () => {
      setRegistryLoading(true);
      setRegistryPage(1);
      try {
        const result = await listSkills({
          query: searchQuery || undefined,
          category: searchCategory || undefined,
          author: searchAuthor || undefined,
          type: searchType || undefined,
          tags: searchTags.length > 0 ? searchTags : undefined,
          sort,
          facets: true,
          page: 1,
          pageSize: REGISTRY_PAGE_SIZE,
          signal: abort.signal,
        });
        if (!abort.signal.aborted) {
          setRegistrySkills(result.skills);
          setRegistryTotal(result.total || result.skills.length);
          setRegistryHasMore((result.total || 0) > REGISTRY_PAGE_SIZE);
          if (result.facets) setTaxonomy(result.facets);
        }
      } catch (err) {
        if (!abort.signal.aborted) setError('Failed to load registry.');
      } finally {
        if (!abort.signal.aborted) setRegistryLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [showRegistry, searchQuery, searchCategory, searchAuthor, searchType, searchTags, registrySort]);

  // Debounced autocomplete suggestions for the registry search box.
  useEffect(() => {
    if (!showRegistry || !showSuggestions) return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await suggestSkills(q, { limit: 8, signal: abort.signal });
        if (!abort.signal.aborted) setSuggestions(result.suggestions);
      } catch {
        if (!abort.signal.aborted) setSuggestions([]);
      }
    }, 180);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [showRegistry, showSuggestions, searchQuery]);

  const applySuggestion = useCallback((s: SkillSuggestion) => {
    setShowSuggestions(false);
    if (s.kind === 'skill') { setSearchQuery(s.label); return; }
    if (s.kind === 'tag') { setSearchQuery(''); toggleSearchTag(s.value); return; }
    if (s.kind === 'author') { setSearchQuery(''); setSearchAuthor(s.value); return; }
    if (s.kind === 'category') { setSearchQuery(''); setSearchCategory(s.value); return; }
  }, [toggleSearchTag]);

  const clearRegistryFilters = useCallback(() => {
    setSearchQuery('');
    setSearchCategory('');
    setSearchAuthor('');
    setSearchType('');
    setSearchTags([]);
  }, []);

  const handleLoadMore = useCallback(async () => {
    const nextPage = registryPage + 1;
    const sort = searchQuery ? registrySort : (registrySort === 'relevant' ? 'popular' : registrySort);
    try {
      const result = await listSkills({
        query: searchQuery || undefined,
        category: searchCategory || undefined,
        author: searchAuthor || undefined,
        type: searchType || undefined,
        tags: searchTags.length > 0 ? searchTags : undefined,
        sort,
        page: nextPage,
        pageSize: REGISTRY_PAGE_SIZE,
      });
      setRegistrySkills((prev) => [...prev, ...result.skills]);
      setRegistryPage(nextPage);
      setRegistryHasMore((result.total || 0) > nextPage * REGISTRY_PAGE_SIZE);
    } catch {
      setError('Failed to load more skills.');
    }
  }, [registryPage, searchQuery, searchCategory, searchAuthor, searchType, searchTags, registrySort]);

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
                  npx @dmzagent/skill-builder install email-classifier
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

          <section className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 text-stone-100 shadow-xl">
            <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="mb-4 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                  New &middot; MCP server
                </p>
                <h2 className="font-display text-3xl font-light leading-tight text-white sm:text-4xl">
                  Use it from your <span className="italic text-amber-300">coding agent</span>.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-stone-300">
                  Connect Claude Code, Cursor, Codex, or any MCP client to the registry. Your agent
                  can search for skills and install them on demand &mdash; meta skills pull in their
                  whole dependency tree automatically.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs text-stone-400">
                  <span className="rounded-full border border-stone-700 px-3 py-1">skill_search</span>
                  <span className="rounded-full border border-stone-700 px-3 py-1">skill_info</span>
                  <span className="rounded-full border border-stone-700 px-3 py-1">skill_install</span>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-amber-300">
                  Add to your MCP config
                </div>
                <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 font-mono text-xs leading-6 text-stone-200">{`{
  "mcpServers": {
    "skill-builder": {
      "command": "npx",
      "args": ["-y", "@dmzagent/skill-builder-mcp"]
    }
  }
}`}</pre>
                <p className="mt-3 text-xs leading-relaxed text-stone-400">
                  Then ask your agent to install a skill by name &mdash; it writes the files for
                  Claude&nbsp;Code, Cursor, or Codex for you.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <SkillStudio
          spec={skillSpec}
          onSpecChange={updateSkillSpec}
          markdown={editor.markdown}
          onMarkdownChange={(markdown) => setEditor((cur) => ({ ...cur, markdown }))}
          onApplyMarkdown={handleApplyMarkdown}
          markdownPreview={markdownPreview}
          messages={visibleAssistantMessages}
          activity={agentActivity}
          agentInput={assistantInput}
          onAgentInputChange={setAssistantInput}
          onSend={sendMessage}
          isLoading={isLoading}
          selectedSkill={selectedSkill}
          user={user}
          error={error}
          npxCommand={npxCommand}
          onSave={handleCreate}
          onPublish={handlePublishSkill}
          onFork={handleForkSkill}
          onBrowse={() => setShowRegistry(true)}
          onHome={handleGoHome}
          onSignIn={() => { setAuthNotice(''); setShowAuth(true); }}
          onSignOut={handleLogout}
          onInspectSkill={handleInspectSkill}
        />
      )}

      {showRegistry && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/60 pt-12 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-6xl max-h-[88vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-white px-8 py-5">
              <div>
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Registry</p>
                <h2 className="mt-0.5 font-display text-2xl font-normal text-stone-900">Browse skills</h2>
              </div>
              <button onClick={() => setShowRegistry(false)} className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-200">Close</button>
            </div>

            <div className="sticky top-[81px] z-10 space-y-3 border-b border-stone-200 bg-white px-8 py-4">
              {/* Search with autocomplete */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Search skills, tags, authors…"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                      {suggestions.map((s) => (
                        <button
                          key={`${s.kind}-${s.value}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-stone-50"
                        >
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${s.kind === 'skill' ? 'bg-amber-100 text-amber-700' : s.kind === 'tag' ? 'bg-stone-100 text-stone-500' : s.kind === 'author' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>{s.kind}</span>
                          <span className="truncate text-stone-700">{s.label}</span>
                          {s.kind === 'skill' && s.type === 'meta' && <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">meta · {s.dependencies}</span>}
                          {s.kind === 'tag' && s.count ? <span className="ml-auto shrink-0 text-xs text-stone-400">{s.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select
                  value={registrySort}
                  onChange={(e) => setRegistrySort(e.target.value as typeof registrySort)}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 sm:w-40"
                >
                  {searchQuery && <option value="relevant">Most relevant</option>}
                  <option value="popular">Popular</option>
                  <option value="downloads">Most installed</option>
                  <option value="recent">Recently updated</option>
                </select>
              </div>

              {/* Facet controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Type segmented control */}
                <div className="inline-flex overflow-hidden rounded-lg border border-stone-200 text-xs">
                  {([['', 'All'], ['basic', 'Basic'], ['meta', 'Meta']] as const).map(([value, label]) => {
                    const count = taxonomy?.types.find((t) => t.value === value)?.count;
                    return (
                      <button
                        key={label}
                        onClick={() => setSearchType(value)}
                        className={`px-3 py-1.5 font-medium transition ${searchType === value ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
                      >
                        {label}{value !== '' && count != null ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                </div>

                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs outline-none transition focus:border-amber-500"
                >
                  <option value="">All categories</option>
                  {(taxonomy?.categories ?? []).map((c) => (
                    <option key={c.value} value={c.value}>{c.value} ({c.count})</option>
                  ))}
                </select>

                <select
                  value={searchAuthor}
                  onChange={(e) => setSearchAuthor(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs outline-none transition focus:border-amber-500"
                >
                  <option value="">All authors</option>
                  {(taxonomy?.authors ?? []).slice(0, 30).map((a) => (
                    <option key={a.value} value={a.value}>{a.label ?? a.value} ({a.count})</option>
                  ))}
                </select>

                <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-stone-200 text-xs">
                  <button onClick={() => setDenseView(false)} className={`px-3 py-1.5 font-medium transition ${!denseView ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>Cards</button>
                  <button onClick={() => setDenseView(true)} className={`px-3 py-1.5 font-medium transition ${denseView ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>Dense</button>
                </div>
              </div>

              {/* Discovered tags */}
              {(taxonomy?.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(taxonomy?.tags ?? []).slice(0, 14).map((t) => (
                    <button
                      key={t.value}
                      onClick={() => toggleSearchTag(t.value)}
                      className={`rounded-full px-2.5 py-0.5 text-xs transition ${searchTags.includes(t.value) ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                    >
                      {t.value} <span className="opacity-60">{t.count}</span>
                    </button>
                  ))}
                  {(searchCategory || searchAuthor || searchType || searchTags.length > 0 || searchQuery) && (
                    <button onClick={clearRegistryFilters} className="ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-amber-700 underline-offset-2 hover:underline">Clear all</button>
                  )}
                </div>
              )}
            </div>

            <div className="px-8 py-6">
              <p className="mb-4 text-xs text-stone-400">{registryTotal} skill{registryTotal === 1 ? '' : 's'}{searchQuery || searchCategory || searchAuthor || searchType || searchTags.length > 0 ? ' match your filters' : ''}</p>
              {registryLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                </div>
              ) : registrySkills.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-base text-stone-400">No skills found</p>
                  <p className="mt-1 text-sm text-stone-300">Try adjusting your search or clearing filters.</p>
                </div>
              ) : denseView ? (
                <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                  {registrySkills.map((skill) => {
                    const isMeta = skill.type === 'meta' || (skill.dependencies?.length ?? 0) > 0;
                    return (
                      <button
                        key={skill.id}
                        onClick={() => navigateToSkill(skill)}
                        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-stone-50"
                      >
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${isMeta ? 'bg-violet-100 text-violet-700' : 'bg-stone-100 text-stone-500'}`}>{isMeta ? 'meta' : 'basic'}</span>
                        <span className="w-48 shrink-0 truncate text-sm font-medium text-stone-800 group-hover:text-amber-700">{skill.name}</span>
                        <span className="hidden flex-1 truncate text-xs text-stone-400 sm:block">{skill.description}</span>
                        <span className="hidden shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500 md:inline">{skill.category}</span>
                        {isMeta && (skill.dependencies?.length ?? 0) > 0 && <span className="shrink-0 text-[11px] text-violet-600">+{skill.dependencies!.length} deps</span>}
                        <span className="shrink-0 text-[11px] tabular-nums text-stone-400">↓ {skill.downloads ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {registrySkills.map((skill) => {
                    const isMeta = skill.type === 'meta' || (skill.dependencies?.length ?? 0) > 0;
                    return (
                      <button
                        key={skill.id}
                        onClick={() => navigateToSkill(skill)}
                        className="group flex flex-col rounded-xl border border-stone-200 bg-stone-50 p-5 text-left transition hover:border-amber-500/40 hover:bg-white hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-base font-semibold text-stone-800 group-hover:text-amber-700">{skill.name}</h3>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${isMeta ? 'bg-violet-100 text-violet-700' : 'bg-stone-200 text-stone-500'}`}>{isMeta ? 'meta' : 'basic'}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
                          <span className="rounded-full bg-stone-200/70 px-2 py-0.5">{skill.category}</span>
                          {skill.authorHandle && <span>@{skill.authorHandle}</span>}
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-stone-500 line-clamp-2">{skill.description}</p>
                        {isMeta && (skill.dependencies?.length ?? 0) > 0 && (
                          <p className="mt-2 text-xs font-medium text-violet-600">Bundles {skill.dependencies!.length} skill{skill.dependencies!.length === 1 ? '' : 's'}</p>
                        )}
                        {skill.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {skill.tags.slice(0, 5).map((tag) => (
                              <span key={tag} className="rounded-full bg-stone-200/50 px-2 py-0.5 text-xs text-stone-400">{tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 truncate font-mono text-xs text-stone-400">{generateNpxCommand(skill)}</div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-stone-400">
                          <span>↓ {skill.downloads ?? 0}</span>
                          <span>v{skill.version}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {registryHasMore && !registryLoading && (
                <div className="flex justify-center pt-6">
                  <button
                    onClick={handleLoadMore}
                    className="rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-medium text-stone-600 transition hover:border-amber-500 hover:text-amber-700"
                  >
                    Load More
                  </button>
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
            <a href="https://www.npmjs.com/package/@dmzagent/skill-builder" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">npm</a>
          </nav>
        </div>
      </footer>
    </div>
      } />
    </Routes>
  );
}

export default App;
