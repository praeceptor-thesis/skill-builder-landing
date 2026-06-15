import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { SEOHead } from '../seo/SEOHead';
import { SkillJsonLd, BreadcrumbJsonLd } from '../seo/JsonLd';
import type { Skill } from '../services/api';
import { generateNpxCommand, getSkill, getCurrentUser, updateSkillVisibility, deleteSkill } from '../services/api';

const SITE_URL = 'https://skill-builder.ai';

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
      promptTemplate: 'You are a dialogue flow manager. Guide the user through a structured conversation.\n\nCurrent Stage: {{stage}}\nContext: {{context}}\nUser Input: {{input}}\n\nRespond appropriately and indicate the next stage.',
      examples: [
        { title: 'Onboarding Flow', input: 'Hello', output: "Welcome! Let's get you set up. What's your name?" },
        { title: 'Troubleshooting Flow', input: "My printer isn't working", output: "I'll help you troubleshoot. What's the printer model?" },
      ],
      tests: [],
    },
    markdown: '',
    author: { id: 'system', name: 'Skill Builder' },
    authorHandle: 'skill-builder',
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
      promptTemplate: 'Extract entities from the following text.\n\nEntity Types: {{entityTypes}}\nText: {{input}}\n\nOutput as JSON with entity type, value, and confidence.',
      examples: [
        {
          title: 'Meeting Scheduling',
          input: 'Meet John at 3pm tomorrow at the coffee shop',
          output: '{"entities":[{"type":"person","value":"John","confidence":0.95},{"type":"time","value":"3pm tomorrow","confidence":0.9},{"type":"location","value":"coffee shop","confidence":0.85}]}',
        },
      ],
      tests: [],
    },
    markdown: '',
    author: { id: 'system', name: 'Skill Builder' },
    authorHandle: 'skill-builder',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    version: 1,
    downloads: 28,
  },
];

const categoryColors: Record<string, { bg: string; text: string; badge: string; border: string }> = {
  Conversational: { bg: 'bg-amber-50', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-700', border: 'border-amber-200' },
  Data: { bg: 'bg-blue-50', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
  Automation: { bg: 'bg-emerald-50', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200' },
  Utilities: { bg: 'bg-violet-50', text: 'text-violet-900', badge: 'bg-violet-100 text-violet-700', border: 'border-violet-200' },
  Healthcare: { bg: 'bg-rose-50', text: 'text-rose-900', badge: 'bg-rose-100 text-rose-700', border: 'border-rose-200' },
  Compliance: { bg: 'bg-orange-50', text: 'text-orange-900', badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200' },
  Coding: { bg: 'bg-sky-50', text: 'text-sky-900', badge: 'bg-sky-100 text-sky-700', border: 'border-sky-200' },
  Research: { bg: 'bg-purple-50', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
};

function getCategoryColor(category: string) {
  return categoryColors[category] ?? categoryColors.Conversational;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function SkillDetailPage() {
  const { scope, skillSlug, skillId } = useParams();
  const resolvedId = scope ? `${scope}/${skillSlug}` : skillId;
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ handle: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updatingVis, setUpdatingVis] = useState(false);

  useEffect(() => {
    if (!resolvedId) {
      setLoading(false);
      return;
    }

    const fromStorage = sessionStorage.getItem(`skill-${resolvedId}`);
    if (fromStorage) {
      try {
        setSkill(JSON.parse(fromStorage) as Skill);
        setLoading(false);
        return;
      } catch { /* ignore */ }
    }

    const localSkill = sampleSkills.find((s) => s.id === resolvedId);
    if (localSkill) {
      setSkill(localSkill);
      setLoading(false);
      return;
    }

    getSkill(resolvedId)
      .then((res) => setSkill(res.skill))
      .catch(() => {
        setSkill(null);
      })
      .finally(() => setLoading(false));
  }, [resolvedId]);

  useEffect(() => {
    getCurrentUser().then(res => setCurrentUser(res.user)).catch(() => {});
  }, []);

  const spec = skill?.spec ? skill.spec : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-[#f5f0eb] flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-4xl font-light text-stone-800">Skill not found</h1>
          <p className="mt-3 text-stone-500">The skill you are looking for does not exist.</p>
          <Link to="/" className="mt-6 inline-flex rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-amber-600">
            Back to Registry
          </Link>
        </div>
      </div>
    );
  }

  const colors = getCategoryColor(skill.category);
  const canonicalUrl = `${SITE_URL}/skill/${skill.id}`;
  const npxCommand = generateNpxCommand(skill);

  const handleCopy = () => {
    navigator.clipboard.writeText(npxCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SEOHead
        title={skill.name}
        description={skill.description}
        canonicalUrl={canonicalUrl}
        publishedTime={skill.createdAt}
        author={skill.author.name}
        tags={skill.tags}
      />
      <SkillJsonLd skill={skill} url={canonicalUrl} />
      <BreadcrumbJsonLd items={[
        { name: 'Registry', url: `${SITE_URL}/` },
        { name: skill.name, url: canonicalUrl },
      ]} />

      <div className="min-h-screen bg-[#f5f0eb]">
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link to="/" className="font-display text-lg font-semibold tracking-tight text-stone-800 hover:text-amber-700 transition">
              skill builder
            </Link>
            <nav className="flex items-center gap-4">
              <Link to="/" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">
                Registry
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-4">
            <Link to="/" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-amber-600 transition">
              &larr; Back to Registry
            </Link>
          </div>

          <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-8 lg:p-12`}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${colors.badge}`}>
                    {skill.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-stone-400">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {skill.downloads.toLocaleString()} downloads
                  </span>
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight text-stone-900">
                  {skill.name}
                </h1>
                <p className="mt-4 max-w-3xl text-lg leading-relaxed text-stone-600">
                  {skill.description}
                </p>
              </div>
            </div>

            {skill.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {skill.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-stone-600 border border-stone-200">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0 max-w-xl">
                <div className="relative">
                  <div className="flex items-center rounded-xl border border-stone-300 bg-white px-4 py-3 font-mono text-sm text-stone-800 overflow-x-auto">
                    <code className="whitespace-nowrap">{npxCommand}</code>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-stone-400">
                  Run this command to install the skill locally
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-amber-600"
                >
                  Use in Architect
                </button>
                <button
                  onClick={() => setShowSource(true)}
                  className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-amber-500 hover:text-amber-700"
                >
                  View Source
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              {spec?.purpose && (
                <section className="rounded-2xl border border-stone-200 bg-white p-8">
                  <h2 className="font-display text-2xl font-normal text-stone-900">Purpose</h2>
                  <p className="mt-3 leading-relaxed text-stone-600">{spec.purpose}</p>
                </section>
              )}

              {spec?.instructions && spec.instructions.length > 0 && (
                <section className="rounded-2xl border border-stone-200 bg-white p-8">
                  <h2 className="font-display text-2xl font-normal text-stone-900">Instructions</h2>
                  <ol className="mt-4 space-y-3">
                    {spec.instructions.map((instruction, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-relaxed text-stone-600">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-white">
                          {i + 1}
                        </span>
                        <span className="pt-1">{instruction}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {spec?.promptTemplate && (
                <section className="rounded-2xl border border-stone-200 bg-white p-8">
                  <h2 className="font-display text-2xl font-normal text-stone-900">Prompt Template</h2>
                  <div className="mt-4 rounded-xl bg-stone-950 px-5 py-4">
                    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm leading-relaxed text-stone-100">
                      {spec.promptTemplate}
                    </pre>
                  </div>
                </section>
              )}

              {spec?.examples && spec.examples.length > 0 && (
                <section className="rounded-2xl border border-stone-200 bg-white p-8">
                  <h2 className="font-display text-2xl font-normal text-stone-900">Examples</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {spec.examples.map((example, i) => (
                      <div key={i} className="rounded-xl border border-stone-200 bg-stone-50 p-5">
                        <h3 className="text-sm font-semibold text-stone-800">{example.title || `Example ${i + 1}`}</h3>
                        <div className="mt-3 space-y-2">
                          <div>
                            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Input</p>
                            <pre className="mt-1 rounded-lg bg-white p-3 text-xs leading-relaxed text-stone-600 overflow-x-auto">{example.input}</pre>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Output</p>
                            <pre className="mt-1 rounded-lg bg-white p-3 text-xs leading-relaxed text-stone-600 overflow-x-auto">{example.output}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Skill Info</h3>
                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs text-stone-400">Author</dt>
                    <dd className="mt-0.5 text-sm font-medium text-stone-800">
                      {skill.author.avatar ? (
                        <span className="flex items-center gap-2">
                          <img src={skill.author.avatar} alt="" className="h-5 w-5 rounded-full" />
                          {skill.author.name}
                        </span>
                      ) : skill.author.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-400">Version</dt>
                    <dd className="mt-0.5 text-sm font-medium text-stone-800">v{skill.version}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-400">Category</dt>
                    <dd className="mt-0.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}>
                        {skill.category}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-400">Created</dt>
                    <dd className="mt-0.5 text-sm text-stone-600">{formatDate(skill.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-400">Updated</dt>
                    <dd className="mt-0.5 text-sm text-stone-600">{formatDate(skill.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-400">Downloads</dt>
                    <dd className="mt-0.5 text-sm font-medium text-stone-800">{skill.downloads.toLocaleString()}</dd>
                  </div>
                  {skill.forkedFrom && (
                    <div>
                      <dt className="text-xs text-stone-400">Forked From</dt>
                      <dd className="mt-0.5 text-sm text-stone-600">{skill.forkedFrom}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Install</h3>
                <div className="mt-3">
                  <div className="rounded-xl bg-stone-950 px-4 py-3">
                    <code className="block break-all font-mono text-xs text-amber-200">{npxCommand}</code>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="mt-2 w-full rounded-lg bg-stone-900 py-2 text-xs font-medium text-white transition hover:bg-amber-600"
                  >
                    {copied ? 'Copied!' : 'Copy Install Command'}
                  </button>
                </div>
              </div>

              {currentUser?.handle === skill.authorHandle && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500">Danger Zone</h3>
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-800">Visibility</p>
                        <p className="text-xs text-stone-500">{skill.visibility === 'draft' ? 'Only you can see this skill' : 'Anyone can find and install this skill'}</p>
                      </div>
                      <button
                        onClick={async () => {
                          setUpdatingVis(true);
                          try {
                            const toggled = skill.visibility === 'draft' ? 'public' : 'draft';
                            const res = await updateSkillVisibility(skill.id, toggled);
                            setSkill(res.skill);
                          } catch {}
                          setUpdatingVis(false);
                        }}
                        disabled={updatingVis}
                        className="rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-700 transition hover:border-red-500 hover:text-red-600 disabled:opacity-50"
                      >
                        {updatingVis ? '...' : skill.visibility === 'draft' ? 'Publish' : 'Set to Draft'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-stone-800">Delete skill</p>
                        <p className="text-xs text-stone-500">Permanently remove this skill from the registry</p>
                      </div>
                      {confirmDelete ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              setDeleting(true);
                              try {
                                await deleteSkill(skill.id);
                                navigate('/');
                              } catch {}
                              setDeleting(false);
                              setConfirmDelete(false);
                            }}
                            disabled={deleting}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting ? '...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </main>

        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <p className="text-xs text-stone-400">skill builder &mdash; open-source skill registry &amp; architect</p>
            <nav className="flex items-center gap-6">
              <a href="https://github.com/praeceptor-thesis/skill-builder-landing" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">GitHub</a>
              <a href="https://github.com/praeceptor-thesis/skill-builder-landing?tab=readme-ov-file#readme" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">Docs</a>
              <a href="https://www.npmjs.com/package/@concordex-ai/skill-builder" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-stone-500 hover:text-amber-600 transition">npm</a>
            </nav>
          </div>
        </footer>
      </div>

      {showSource && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/60 pt-12 backdrop-blur-sm" onClick={() => setShowSource(false)}>
          <div className="mx-4 w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="font-display text-lg font-medium text-stone-900">Raw Markdown</h2>
              <button onClick={() => setShowSource(false)} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="overflow-x-auto p-6 text-sm leading-relaxed text-stone-800 whitespace-pre-wrap font-mono">{skill.markdown}</pre>
          </div>
        </div>
      )}
    </>
  );
}
