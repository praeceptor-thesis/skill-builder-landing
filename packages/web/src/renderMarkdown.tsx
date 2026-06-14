import React from 'react';

export function renderMarkdown(markdown: string) {
  if (!markdown) return <p className="text-slate-500 italic">Start writing your skill markdown...</p>;

  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent = '';
  let codeBlockLang = '';
  let listItems: { items: React.ReactNode[]; type: 'ul' | 'ol'; key: string } | null = null;

  function flushList() {
    if (!listItems) return;
    const ListTag = listItems.type === 'ul' ? 'ul' : 'ol';
    const className = listItems.type === 'ul'
      ? 'list-disc list-inside ml-4 space-y-1 text-slate-300'
      : 'list-decimal list-inside ml-4 space-y-1 text-slate-300';
    elements.push(
      React.createElement(ListTag, { key: listItems.key, className }, listItems.items),
    );
    listItems = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = '';
      } else {
        inCodeBlock = false;
        elements.push(
          <pre key={i} className="bg-slate-900 rounded-xl p-4 overflow-x-auto my-2">
            <code className={`language-${codeBlockLang} text-sm`}>{codeBlockContent.trim()}</code>
          </pre>
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h1 key={i} className="text-3xl font-bold mt-6 mb-3 text-white">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={i} className="text-2xl font-semibold mt-5 mb-2 text-white">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={i} className="text-xl font-semibold mt-4 mb-2 text-slate-200">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!listItems) {
        listItems = { items: [], type: 'ul', key: `list-${i}` };
      }
      listItems.items.push(<li key={i}>{line.slice(2)}</li>);
    } else if (line.match(/^\d+\./)) {
      if (!listItems) {
        listItems = { items: [], type: 'ol', key: `list-${i}` };
      }
      listItems.items.push(<li key={i}>{line.replace(/^\d+\.\s*/, '')}</li>);
    } else if (line.trim() === '') {
      flushList();
      elements.push(<br key={i} />);
    } else {
      flushList();
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const boldText = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      const italicText = boldText.replace(/\*(.*?)\*/g, '<em>$1</em>');
      const codeText = italicText.replace(/`(.*?)`/g, '<code class="bg-slate-800 px-1 rounded text-cyan-300">$1</code>');
      elements.push(<p key={i} className="text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: codeText }} />);
    }
  }

  flushList();

  return <div>{elements}</div>;
}
