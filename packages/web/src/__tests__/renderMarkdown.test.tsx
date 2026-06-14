import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderMarkdown } from '../renderMarkdown';

describe('renderMarkdown', () => {
  it('renders empty state', () => {
    const { container } = render(<div>{renderMarkdown('')}</div>);
    expect(container.textContent).toContain('Start writing your skill markdown...');
  });

  it('renders h1', () => {
    render(<div>{renderMarkdown('# My Skill')}</div>);
    expect(screen.getByText('My Skill').tagName).toBe('H1');
  });

  it('renders h2', () => {
    render(<div>{renderMarkdown('## Purpose')}</div>);
    expect(screen.getByText('Purpose').tagName).toBe('H2');
  });

  it('renders h3', () => {
    render(<div>{renderMarkdown('### Example')}</div>);
    expect(screen.getByText('Example').tagName).toBe('H3');
  });

  it('renders bullet list', () => {
    render(<div>{renderMarkdown('- item one\n- item two')}</div>);
    expect(screen.getByText('item one').tagName).toBe('LI');
    expect(screen.getByText('item two').tagName).toBe('LI');
  });

  it('renders numbered list', () => {
    render(<div>{renderMarkdown('1. first\n2. second')}</div>);
    expect(screen.getByText('first').tagName).toBe('LI');
    expect(screen.getByText('second').tagName).toBe('LI');
  });

  it('renders code block', () => {
    const { container } = render(<div>{renderMarkdown('```\nconst x = 1;\n```')}</div>);
    expect(container.textContent).toContain('const x = 1;');
  });

  it('renders code block with language', () => {
    const { container } = render(<div>{renderMarkdown('```typescript\nconst x: number = 1;\n```')}</div>);
    expect(container.textContent).toContain('const x: number = 1;');
  });

  it('renders bold text', () => {
    const { container } = render(<div>{renderMarkdown('**bold text**')}</div>);
    expect(container.innerHTML).toContain('<strong>');
  });

  it('renders inline code', () => {
    const { container } = render(<div>{renderMarkdown('Use the `renderMarkdown` function')}</div>);
    expect(container.innerHTML).toContain('code class');
  });

  it('renders a full skill markdown document', () => {
    const md = `# Text Summarizer

## Purpose
Summarize long text into concise bullet points.

## Instructions
1. Accept input text
2. Generate summary

## Prompt Template
\`\`\`
Summarize: {{input}}
\`\`\`

## Examples
- Input: "Long text here"
- Output: "Short summary"
`;
    render(<div>{renderMarkdown(md)}</div>);
    expect(screen.getByText('Text Summarizer')).toBeTruthy();
    expect(screen.getByText('Purpose')).toBeTruthy();
    expect(screen.getByText('Instructions')).toBeTruthy();
    expect(screen.getByText('Prompt Template')).toBeTruthy();
    expect(screen.getByText('Examples')).toBeTruthy();
  });
});
