import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listSkills, saveSkill, forkSkill, chatAgent, executeSkill, login, register, getCurrentUser, setAuthToken, clearAuthToken, getAuthToken, type Skill, type AgentMessage, type User, generateNpxCommand } from './services/api';
import { renderMarkdown } from './renderMarkdown';

const sampleSkills: Skill[] = [
  {
    id: 'dialogue-flow',
    name: 'Dialogue Flow',
    description: 'Build interactive conversation flows for custom AI assistants.',
    category: 'Conversational',
    tags: ['conversation', 'flow', 'assistant'],
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

const initialAssistantMessages: AgentMessage[] = [
  {
    role: 'system',
    text: 'You are an assistant that helps users write skill markdown documents.',
  },
  {
    role: 'assistant',
    text: 'Tell me what kind of skill you want to build, and I\'ll help you write the markdown.',
  },
];

function App() {
  const [view, setView] = useState<'landing' | 'workspace'>('landing');
  const [skills, setSkills] = useState<Skill[]>(sampleSkills);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(initialEditorState);
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

  const handleCreate = useCallback(async () => {
    if (!editor.name || !editor.description || !editor.markdown) return;
    const baseId = editor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'untitled';
    const id = skills.some(s => s.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
    const newSkill: Skill = {
      id,
      name: editor.name,
      description: editor.description,
      category: editor.category,
      tags: editor.tags.split(',').map(t => t.trim()).filter(Boolean),
      markdown: editor.markdown,
      author: user ? { id: user.id, name: user.name } : { id: 'local', name: 'Local User' },
      authorHandle: user?.handle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      downloads: 0,
    };
    try {
      setError(null);
      await saveSkill(newSkill);
      setSkills((prev) => [...prev, newSkill]);
      setSelected(id);
      setEditor(initialEditorState);
    } catch {
      setSkills((prev) => [...prev, newSkill]);
      setSelected(id);
      setEditor(initialEditorState);
    }
  }, [editor.name, editor.description, editor.markdown, editor.category, editor.tags, skills, user]);

  const handleOpenRegistry = useCallback(() => {
    setView('workspace');
    setShowRegistry(true);
  }, []);

  const handleStartAuthoring = useCallback(() => {
    setSelected(null);
    setEditor(initialEditorState);
    setAssistantMessages(initialAssistantMessages);
    setView('workspace');
  }, []);

  const sendMessage = useCallback(async () => {
    if (!assistantInput.trim() || isLoading) return;

    const userMessage: AgentMessage = {
      role: 'user',
      text: assistantInput.trim(),
    };

    setAssistantMessages((prev) => [...prev, userMessage]);
    setAssistantInput('');
    setIsLoading(true);
    setError(null);

    try {
      const currentMessages = assistantMessagesRef.current;
      const currentDraft = editor.markdown ? `\n\nCurrent editor draft:\n\`\`\`markdown\n${editor.markdown}\n\`\`\`` : '';
      const hasSystem = currentMessages[0]?.role === 'system';
      const tail = [...currentMessages.slice(hasSystem ? 1 : 0), userMessage].slice(-19);
      const recentMessages = hasSystem ? [currentMessages[0], ...tail] : tail;
      const response = await chatAgent({
        messages: recentMessages,
        skillId: selectedSkill?.id,
        taskOutline: 'Help the user write skill markdown.' + currentDraft,
      });

      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: response.response }]);
    } catch (err) {
      setError('Chat failed. Check your connection.');
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [assistantInput, isLoading, selectedSkill, editor.markdown]);

  const handlePublishSkill = useCallback(async () => {
    if (!selectedSkill) return;
    try {
      setError(null);
      const skillToPublish = {
        ...selectedSkill,
        name: editor.name || selectedSkill.name,
        description: editor.description || selectedSkill.description,
        category: editor.category || selectedSkill.category,
        tags: editor.tags ? editor.tags.split(',').map(t => t.trim()).filter(Boolean) : selectedSkill.tags,
        markdown: editor.markdown || selectedSkill.markdown,
      };
      await saveSkill(skillToPublish);
      alert(`Published "${skillToPublish.name}"\n\nInstall with: ${generateNpxCommand(skillToPublish)}`);
    } catch {
      setError('Failed to publish skill.');
    }
  }, [selectedSkill, editor.name, editor.description, editor.category, editor.tags, editor.markdown]);

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const result = authMode === 'login'
        ? await login(authEmail, authPassword)
        : await register(authName, authEmail, authPassword, authHandle);
      setAuthToken(result.token);
      setUser(result.user);
      setShowAuth(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      setAuthHandle('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setAuthLoading(false);
    }
  }, [authMode, authEmail, authPassword, authName, authHandle]);

  const handleLogout = useCallback(() => {
    clearAuthToken();
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
    setEditor({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags.join(', '),
      markdown: skill.markdown,
    });
    setSelected(skill.id);
  }, []);

  const handleForkSkill = useCallback(async () => {
    if (!selectedSkill) return;
    try {
      setError(null);
      const result = await forkSkill(selectedSkill.id);
      setSkills((prev) => [...prev, result.skill]);
      setSelected(result.skill.id);
      handleLoadSkill(result.skill);
    } catch {
      setError('Fork failed. Creating local copy.');
      const forkId = `${selectedSkill.id}-fork-${Date.now()}`;
      const fork = { ...selectedSkill, id: forkId, name: `${selectedSkill.name} (fork)`, forkedFrom: selectedSkill.id, author: { id: 'local', name: 'Local User' }, authorHandle: undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, downloads: 0 };
      setSkills((prev) => [...prev, fork]);
      setSelected(forkId);
      handleLoadSkill(fork);
    }
  }, [selectedSkill, handleLoadSkill]);

  const handleApplyMarkdown = useCallback((text: string) => {
    const match = text.match(/```(?:markdown)?\s*([\s\S]*?)```/);
    if (match) setEditor((cur) => ({ ...cur, markdown: match[1].trim() }));
  }, []);

  const handleGoHome = useCallback(() => setView('landing'), []);

  return (
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
              <button onClick={() => setShowAuth(true)} className="text-sm font-medium text-stone-700 hover:text-stone-900">Sign in</button>
            )}
          </header>

          <main>
            <section className="mt-28 mb-20">
              <h1 className="font-display text-5xl sm:text-6xl font-light leading-[1.1] tracking-tight text-stone-900">
                Find skills or<br />
                <span className="italic font-normal text-amber-700">build your own</span>.
              </h1>
            </section>
          </main>

          <div className="grid gap-8 sm:grid-cols-2">
            <div className="group relative rounded-2xl border border-stone-200 bg-white p-10 transition-all hover:shadow-lg hover:-translate-y-0.5">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold italic text-amber-600">Browse</h2>
              <hr className="mt-4 w-12 border-stone-200" />
              <p className="mt-5 text-base leading-relaxed text-stone-600 max-w-sm">
                Find ready-to-use skills in the registry. Install with a single command.
              </p>
              <button
                onClick={() => { handleOpenRegistry(); }}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Open Registry &rarr;
              </button>
            </div>

            <div className="group relative rounded-2xl border border-stone-200 bg-white p-10 transition-all hover:shadow-lg hover:-translate-y-0.5">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold italic text-amber-600">Author</h2>
              <hr className="mt-4 w-12 border-stone-200" />
              <p className="mt-5 text-base leading-relaxed text-stone-600 max-w-sm">
                Build custom skills from scratch. Use the assistant to help write the markdown.
              </p>
              <button
                onClick={handleStartAuthoring}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Start Writing &rarr;
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
                <button onClick={() => setShowAuth(true)} className="rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600">Sign in</button>
              )}
            </div>
          </header>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
            <section className="rounded-2xl border border-stone-200 bg-white p-8">
              <div className="grid gap-5 sm:grid-cols-3 mb-5">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Name</span>
                  <input
                    value={editor.name}
                    onChange={(e) => setEditor((cur) => ({ ...cur, name: e.target.value }))}
                    placeholder="Dialogue Flow"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Category</span>
                  <select
                    value={editor.category}
                    onChange={(e) => setEditor((cur) => ({ ...cur, category: e.target.value }))}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  >
                    <option>Conversational</option>
                    <option>Data</option>
                    <option>Automation</option>
                    <option>Utilities</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-stone-700">Tags</span>
                  <input
                    value={editor.tags}
                    onChange={(e) => setEditor((cur) => ({ ...cur, tags: e.target.value }))}
                    placeholder="conversation, flow"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                  />
                </label>
              </div>

              <label className="space-y-1.5 text-sm mb-5 block">
                <span className="font-medium text-stone-700">Description</span>
                <textarea
                  value={editor.description}
                  onChange={(e) => setEditor((cur) => ({ ...cur, description: e.target.value }))}
                  placeholder="Brief description of what this skill does"
                  rows={2}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                />
              </label>

              <div className="flex items-center gap-2 mb-4">
                {(['edit', 'split', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setEditorMode(mode)}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      editorMode === mode
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>

              <div className={`grid gap-4 ${editorMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {editorMode !== 'preview' && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-stone-400">Markdown</span>
                    <textarea
                      value={editor.markdown}
                      onChange={(e) => setEditor((cur) => ({ ...cur, markdown: e.target.value }))}
                      placeholder="# Skill Name\n\n## Purpose\n\n## Instructions\n\n## Prompt Template\n\n## Examples"
                      className="w-full min-h-[450px] font-mono text-sm rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-amber-500 focus:bg-white resize-y"
                      spellCheck={false}
                    />
                  </div>
                )}
                {editorMode !== 'edit' && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-stone-400">Preview</span>
                    <div className="min-h-[450px] rounded-xl border border-stone-200 bg-white px-5 py-4 overflow-y-auto prose prose-stone max-w-none">
                      {markdownPreview}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={handleCreate} className="rounded-full bg-amber-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-amber-700">Save</button>
                <button onClick={handlePublishSkill} disabled={!selectedSkill} className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 disabled:opacity-40">Publish</button>
                {selectedSkill && (
                  <>
                    <button onClick={handleForkSkill} className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400">Fork</button>
                    <div className="flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-xs text-stone-500">
                      <code className="truncate max-w-[200px]">{npxCommand}</code>
                      <button onClick={() => navigator.clipboard.writeText(npxCommand)} className="font-medium text-stone-700 hover:text-stone-900">Copy</button>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-6 flex flex-col">
              <h2 className="text-sm font-medium text-stone-700 mb-4">Assistant</h2>
              <div className="flex-1 space-y-4 min-h-[300px] max-h-[500px] overflow-y-auto mb-4">
                {visibleAssistantMessages.map((msg, i) => (
                  <div key={i} className={`rounded-xl p-4 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-stone-100 text-stone-700'
                      : 'bg-amber-50 text-stone-700'
                  }`}>
                    <p className="text-xs font-medium text-stone-400 mb-1">{msg.role === 'user' ? 'You' : 'Assistant'}</p>
                    <p className="whitespace-pre-line">{msg.text}</p>
                    {msg.role === 'assistant' && msg.text.includes('```') && (
                      <button
                        onClick={() => handleApplyMarkdown(msg.text)}
                        className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-200"
                      >
                        Apply markdown
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Describe the skill you want..."
                  className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:bg-white"
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading}
                  className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {isLoading ? '...' : 'Send'}
                </button>
              </div>
              {selectedSkill && (
                <button
                  onClick={handleExecuteSkill}
                  disabled={isLoading}
                  className="mt-3 text-xs font-medium text-stone-400 hover:text-stone-700 transition self-start"
                >
                  Run against active skill &rarr;
                </button>
              )}
            </section>
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
                      onClick={() => {
                        setSkills(prev => prev.some(s => s.id === skill.id) ? prev : [...prev, skill]);
                        handleLoadSkill(skill);
                        setShowRegistry(false);
                      }}
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
          <p className="text-xs text-stone-400">skill builder &mdash; open-source skill registry &amp; editor</p>
          <nav className="flex items-center gap-6">
            <a href="https://github.com/praeceptor-thesis/skill-builder-landing" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">GitHub</a>
            <a href="https://github.com/praeceptor-thesis/skill-builder-landing?tab=readme-ov-file#readme" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">Docs</a>
            <a href="https://www.npmjs.com/package/@concordex-ai/skill-builder" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">npm</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default App;
