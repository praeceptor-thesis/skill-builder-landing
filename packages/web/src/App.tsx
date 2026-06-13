import { useMemo, useState } from 'react';

const sampleSkills = [
  {
    id: 'dialogue-flow',
    name: 'Dialogue Flow',
    description: 'Build interactive conversation flows for custom AI assistants.',
    category: 'Conversational',
    persona: 'Assistant flow manager',
  },
  {
    id: 'extract-entities',
    name: 'Entity Extractor',
    description: 'Create extraction skills for structured data from user input.',
    category: 'Data',
    persona: 'Data structuring assistant',
  },
];

type Skill = typeof sampleSkills[number];

type EditorState = {
  name: string;
  description: string;
  category: string;
  persona: string;
  prompts: string;
  instructions: string;
};

type AgentMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

const initialEditorState: EditorState = {
  name: '',
  description: '',
  category: 'Conversational',
  persona: 'Agent persona for the skill',
  prompts: '',
  instructions: '',
};

const initialAgentMessages: AgentMessage[] = [
  {
    role: 'system',
    text: 'You are an agent that routes tasks through skills and provides concise guidance.',
  },
  {
    role: 'assistant',
    text: 'Ready to help you build, test, and publish a skill-backed agent experience.',
  },
];

function App() {
  const [skills, setSkills] = useState<Skill[]>(sampleSkills);
  const [selected, setSelected] = useState<string | null>('dialogue-flow');
  const [editor, setEditor] = useState<EditorState>(initialEditorState);
  const [taskOutline, setTaskOutline] = useState('Help the user design a conversational agent with a guided skill pipeline.');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(initialAgentMessages);
  const [agentInput, setAgentInput] = useState('');

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selected) ?? null,
    [selected, skills],
  );

  const handleCreate = () => {
    if (!editor.name || !editor.description) return;
    const id = editor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    setSkills((prev) => [
      ...prev,
      {
        id,
        name: editor.name,
        description: editor.description,
        category: editor.category,
        persona: editor.persona,
      },
    ]);
    setSelected(id);
    setEditor(initialEditorState);
  };

  const runAgent = () => {
    if (!agentInput.trim()) return;

    const userMessage: AgentMessage = {
      role: 'user',
      text: agentInput.trim(),
    };

    const assistantResponse: AgentMessage = {
      role: 'assistant',
      text: `Simulated response routed through ${selectedSkill?.name ?? 'the current skill'}.\n
Task: ${taskOutline}\n
Persona: ${selectedSkill?.persona ?? 'Assistant'}\n
Instructions: ${editor.instructions || 'No instructions provided.'}`,
    };

    setAgentMessages((prev) => [...prev, userMessage, assistantResponse]);
    setAgentInput('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-cyan-400">Agent Skill Builder</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Design agent-led skills and workflows</h1>
            <p className="mt-4 max-w-2xl text-slate-400">
              Build agent experiences with personality, composable skills, and a sandboxed chat interface.
            </p>
          </div>
          <div className="grid gap-3 sm:auto-cols-fr sm:grid-flow-col">
            <button className="rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Skill registry
            </button>
            <button className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500">
              Publish agent skill
            </button>
          </div>
        </header>

        <div className="grid gap-8 xl:grid-cols-[320px_1.2fr]">
          <aside className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Agent workspace</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Live agent flow</h2>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Agent persona</p>
              <h3 className="mt-3 text-lg font-semibold text-white">Conversation steward</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This agent coordinates skills, guides user requests, and routes outputs into the right pipeline stage.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Task goal</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{taskOutline}</p>
              <button
                onClick={() => setTaskOutline('Help the user build an agent experience with composable skills and a smooth sandbox flow.')}
                className="mt-4 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500">
                Refresh task
              </button>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-5">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Active skill</p>
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-white">{selectedSkill?.name ?? 'Select a skill'}</p>
                <p className="text-sm text-slate-400">{selectedSkill?.description ?? 'Pick a skill from the library to route requests.'}</p>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Category</p>
                <p className="text-sm text-slate-200">{selectedSkill?.category ?? 'None'}</p>
              </div>
            </div>
          </aside>

          <main className="space-y-8">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Agent canvas</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Build the agent experience</h2>
                </div>
                <button className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                  Open agent registry
                </button>
              </div>
              <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
                <div className="space-y-6">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Agent instructions</span>
                    <textarea
                      value={editor.instructions}
                      onChange={(event) => setEditor((current) => ({ ...current, instructions: event.target.value }))}
                      placeholder="Define how the agent should behave when routing skills."
                      className="min-h-[170px] w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Skill prompt template</span>
                    <textarea
                      value={editor.prompts}
                      onChange={(event) => setEditor((current) => ({ ...current, prompts: event.target.value }))}
                      placeholder="Define the skill prompt template used by the agent."
                      className="min-h-[170px] w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                    />
                  </label>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-6">
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Agent summary</p>
                  <div className="mt-5 space-y-4 text-sm text-slate-300">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Current persona</p>
                      <p className="mt-2 text-white">{selectedSkill?.persona ?? editor.persona}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Skill status</p>
                      <p className="mt-2 text-white">{selectedSkill ? 'Connected' : 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Running mode</p>
                      <p className="mt-2 text-white">Sandbox</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/10">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Agent console</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Chat with your agent</h2>
                  </div>
                  <button onClick={runAgent} className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                    Send message
                  </button>
                </div>

                <div className="space-y-4">
                  {agentMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`rounded-3xl p-4 ${
                        message.role === 'user'
                          ? 'bg-slate-950 text-slate-100 border border-slate-800'
                          : message.role === 'assistant'
                          ? 'bg-cyan-500/10 text-slate-100 border border-cyan-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800'
                      }`}>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">{message.role}</p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6">{message.text}</p>
                    </div>
                  ))}
                </div>

                <label className="mt-6 block text-sm text-slate-300">
                  <span className="sr-only">Agent message</span>
                  <textarea
                    value={agentInput}
                    onChange={(event) => setAgentInput(event.target.value)}
                    placeholder="Ask the agent to preview a skill or route a request..."
                    className="min-h-[110px] w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                  />
                </label>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/10">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Skill editor</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Agent skill details</h2>
                  </div>
                </div>

                <div className="grid gap-4">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Name</span>
                    <input
                      value={editor.name}
                      onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Dialogue Flow"
                      className="w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Category</span>
                    <select
                      value={editor.category}
                      onChange={(event) => setEditor((current) => ({ ...current, category: event.target.value }))}
                      className="w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500">
                      <option>Conversational</option>
                      <option>Data</option>
                      <option>Automation</option>
                      <option>Utilities</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Persona</span>
                    <input
                      value={editor.persona}
                      onChange={(event) => setEditor((current) => ({ ...current, persona: event.target.value }))}
                      placeholder="Assistant persona for this skill"
                      className="w-full rounded-3xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-white outline-none transition focus:border-cyan-500"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button onClick={handleCreate} className="rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                      Save skill
                    </button>
                    <button className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500">
                      Publish agent skill
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
