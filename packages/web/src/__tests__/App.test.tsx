import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from '../App';

function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ['/'] } = {},
) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </HelmetProvider>,
  );
}

const mockListSkills = vi.hoisted(() => vi.fn());
const mockSaveSkill = vi.hoisted(() => vi.fn());
const mockForkSkill = vi.hoisted(() => vi.fn());
const mockCreateSkillBuilderSession = vi.hoisted(() => vi.fn());
const mockSendSkillBuilderTurn = vi.hoisted(() => vi.fn());
const mockExecuteSkill = vi.hoisted(() => vi.fn());
const mockLogin = vi.hoisted(() => vi.fn());
const mockRegister = vi.hoisted(() => vi.fn());
const mockGetCurrentUser = vi.hoisted(() => vi.fn());
const mockSetAuthToken = vi.hoisted(() => vi.fn());
const mockClearAuthToken = vi.hoisted(() => vi.fn());
const mockGetAuthToken = vi.hoisted(() => vi.fn());
const mockIsUnauthorizedError = vi.hoisted(() => vi.fn(() => false));
const mockGenerateNpxCommand = vi.hoisted(
  () =>
    vi.fn((skill: { id: string; authorHandle?: string }) => {
      const prefix = skill.authorHandle ? `@${skill.authorHandle}/` : '';
      return `npx @dmzagent/skill-builder install ${prefix}${skill.id}`;
    }),
);
const mockGetSkill = vi.hoisted(() => vi.fn());
const mockResolveSkillDependencies = vi.hoisted(() => vi.fn());
const mockGetRuntimeProfile = vi.hoisted(() => vi.fn());

vi.mock('../services/api', () => ({
  listSkills: mockListSkills,
  saveSkill: mockSaveSkill,
  forkSkill: mockForkSkill,
  createSkillBuilderSession: mockCreateSkillBuilderSession,
  sendSkillBuilderTurn: mockSendSkillBuilderTurn,
  executeSkill: mockExecuteSkill,
  login: mockLogin,
  register: mockRegister,
  getCurrentUser: mockGetCurrentUser,
  setAuthToken: mockSetAuthToken,
  clearAuthToken: mockClearAuthToken,
  getAuthToken: mockGetAuthToken,
  isUnauthorizedError: mockIsUnauthorizedError,
  generateNpxCommand: mockGenerateNpxCommand,
  getSkill: mockGetSkill,
  resolveSkillDependencies: mockResolveSkillDependencies,
  getRuntimeProfile: mockGetRuntimeProfile,
}));

vi.mock('../renderMarkdown', () => ({
  renderMarkdown: vi.fn((md: string) => {
    if (!md) return React.createElement('p', null, 'Start writing your skill markdown...');
    return React.createElement('div', null, md);
  }),
}));

const mockSkillSpec = {
  name: 'Test Skill',
  description: 'A test skill description',
  category: 'Utilities',
  tags: ['test', 'utility'],
  purpose: 'Test purpose',
  instructions: ['Do step 1', 'Do step 2'],
  promptTemplate: 'You are a test skill.\n\nInput: {{input}}',
  examples: [{ title: 'Example 1', input: 'test input', output: 'test output' }],
  tests: [{ name: 'Test 1', input: 'test', expected: 'result' }],
};

const mockSkill = {
  id: 'test-skill',
  name: 'Test Skill',
  description: 'A test skill description',
  category: 'Utilities',
  tags: ['test', 'utility'],
  spec: mockSkillSpec,
  markdown: '# Test Skill\n\nTest content.',
  author: { id: 'author1', name: 'Test Author' },
  authorHandle: 'testauthor',
  forkedFrom: undefined,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  version: 1,
  downloads: 10,
};

const mockUser = {
  id: 'user1',
  name: 'Test User',
  handle: 'testuser',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00Z',
};

function navigateToWorkspace() {
  fireEvent.click(screen.getAllByText('Build a Skill')[0]);
}

async function waitForWorkspace() {
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/Build a skill that extracts/)).toBeInTheDocument();
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSkills.mockResolvedValue({ skills: [], total: 0 });
    mockGetSkill.mockResolvedValue({ skill: mockSkill });
    mockResolveSkillDependencies.mockResolvedValue([]);
    mockGetRuntimeProfile.mockResolvedValue({
      id: 'preview-sandbox',
      label: 'Preview sandbox',
      description: 'The text-only model this workspace executes skills on.',
      model: '@cf/meta/llama-3.1-8b-instruct-fp8',
      capabilities: ['structured-output', 'streaming', 'multilingual'],
    });
    mockGetAuthToken.mockReturnValue(null);
    mockGetCurrentUser.mockRejectedValue(new Error('Not logged in'));
    mockCreateSkillBuilderSession.mockResolvedValue({
      session: { id: 'session-1', state: { spec: null } },
    });
    mockSendSkillBuilderTurn.mockResolvedValue({
      operations: [
        { type: 'set_name', value: 'Generated Skill' },
        { type: 'set_description', value: 'Generated description' },
      ],
      activity: [],
      message: { role: 'assistant', text: 'Applied operations.' },
      spec: null,
    });
    mockSaveSkill.mockResolvedValue({ skill: mockSkill });
    mockForkSkill.mockResolvedValue({
      skill: { ...mockSkill, id: 'test-skill-fork', name: 'Test Skill (fork)' },
    });
    mockLogin.mockResolvedValue({ user: mockUser, token: 'fake-token' });
    mockRegister.mockResolvedValue({ user: mockUser, token: 'fake-token' });
  });

  describe('Landing page', () => {
    it('renders landing page by default', () => {
      renderWithProviders(<App />);
      expect(screen.getByText(/Reusable AI skills/)).toBeInTheDocument();
      expect(screen.getByText(/for agents and teams/)).toBeInTheDocument();
      expect(screen.getByText('Browse Registry →')).toBeInTheDocument();
      const buildSkillButtons = screen.getAllByText('Build a Skill');
      expect(buildSkillButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows three feature cards', () => {
      renderWithProviders(<App />);
      expect(screen.getByRole('heading', { name: 'Browse' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Author' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Execute' })).toBeInTheDocument();
    });

    it('shows Sign in when not logged in', () => {
      renderWithProviders(<App />);
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('shows user name and Sign out when logged in', async () => {
      mockGetAuthToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue({ user: mockUser });
      renderWithProviders(<App />);
      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
      expect(screen.getByText('Sign out')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('navigates to workspace on Build a Skill', async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('navigates to browse content from landing', async () => {
      mockListSkills.mockResolvedValue({ skills: [mockSkill], total: 1 });
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Browse Registry →'));
      await waitFor(() => {
        expect(screen.getByText(/Browse skills/i)).toBeInTheDocument();
      });
    });

    it('navigates back to landing from workspace', async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();

      fireEvent.click(screen.getByText(/\u2190 skill builder/));
      await waitFor(() => {
        expect(screen.getByText(/Reusable AI skills/)).toBeInTheDocument();
      });
    });

    it('opens architect from Author card', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Open Architect →'));
      await waitForWorkspace();
    });

    it('opens browse content from Execute card', async () => {
      mockListSkills.mockResolvedValue({ skills: [mockSkill], total: 1 });
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Choose a Skill →'));
      await waitFor(() => {
        expect(screen.getByText(/Browse skills/i)).toBeInTheDocument();
      });
    });
  });

  describe('Workspace layout', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('renders Skill Architect sidebar', () => {
      expect(screen.getByText('Skill Architect')).toBeInTheDocument();
      expect(screen.getByText('Agent-first builder')).toBeInTheDocument();
    });

    it('renders Current SkillSpec section', () => {
      expect(screen.getByText('Current SkillSpec')).toBeInTheDocument();
      expect(screen.getByText('Untitled skill')).toBeInTheDocument();
    });

    it('renders the preview invocation pane', () => {
      expect(screen.getByText('Invocation')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/What would a caller send/)).toBeInTheDocument();
    });

    it('renders Save and Publish buttons', () => {
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('renders build pipeline activity log', () => {
      expect(screen.getByText('Build pipeline')).toBeInTheDocument();
      expect(screen.getByText('Skill Architect ready')).toBeInTheDocument();
    });

    it('shows pane toggles for architect, architecture, and preview', () => {
      expect(screen.getByText('Architect')).toBeInTheDocument();
      expect(screen.getByText('Architecture')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getAllByText('Preview').length).toBeGreaterThanOrEqual(1);
    });

    it('collapses the architect pane', () => {
      expect(screen.getByPlaceholderText(/Build a skill that extracts/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Architect'));
      expect(screen.getByPlaceholderText(/Build a skill that extracts/)).not.toBeVisible();
    });

    it('shows the publish readiness checklist', () => {
      expect(screen.getByText('Publish readiness')).toBeInTheDocument();
      expect(screen.getByText('○ Prompt template')).toBeInTheDocument();
    });
  });

  describe('Chat / Skill Architect', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('sends message and creates a session', async () => {
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Build a summarizer skill' } });
      fireEvent.click(screen.getByText('Send to architect'));

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).toHaveBeenCalledWith(
          expect.objectContaining({ intent: 'Build a summarizer skill' }),
        );
      });
    });

    it('shows user message after sending', async () => {
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Build a parser skill' } });
      fireEvent.click(screen.getByText('Send to architect'));

      await waitFor(() => {
        const messages = screen.getAllByText('Build a parser skill');
        expect(messages.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('sends message on Enter key', async () => {
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Build a validator' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).toHaveBeenCalled();
      });
    });

    it('does not send empty message', async () => {
      fireEvent.click(screen.getByText('Send to architect'));

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).not.toHaveBeenCalled();
      });
    });

    it('sends a suggested next step without typing', async () => {
      fireEvent.click(screen.getByText('Name and describe it'));

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).toHaveBeenCalledWith(
          expect.objectContaining({ intent: expect.stringContaining('precise name') }),
        );
      });
    });

    it('handles architect error', async () => {
      mockCreateSkillBuilderSession.mockRejectedValue(new Error('API unavailable'));
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByText('Send to architect'));

      await waitFor(() => {
        expect(screen.getByText(/Skill Architect failed/)).toBeInTheDocument();
      });
    });

    it('disables input while loading', async () => {
      mockCreateSkillBuilderSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Slow request' } });
      fireEvent.click(screen.getByText('Send to architect'));

      expect(screen.getByText('Working…')).toBeDisabled();
    });
  });

  describe('Settings drawer', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
      fireEvent.click(screen.getByText('Settings'));
    });

    it('opens with the identity fields', () => {
      expect(screen.getByPlaceholderText('Clinical Note Summarizer')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('summarization, clinical')).toBeInTheDocument();
    });

    it('updates the skill name', () => {
      const nameInput = screen.getByPlaceholderText('Clinical Note Summarizer');
      fireEvent.change(nameInput, { target: { value: 'Custom Skill Name' } });
      expect(nameInput).toHaveValue('Custom Skill Name');
      expect(screen.getAllByText('Custom Skill Name').length).toBeGreaterThanOrEqual(1);
    });

    it('switches to the behavior section', () => {
      fireEvent.click(screen.getByText('Behavior'));
      expect(screen.getByPlaceholderText('What job should this skill own?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Identify the user intent/)).toBeInTheDocument();
    });

    it('declares a required capability', () => {
      fireEvent.click(screen.getByText('Capabilities'));
      const toolUseRow = screen.getByText('Tool use').closest('div')!.parentElement!;
      fireEvent.click(within(toolUseRow).getByText('Required'));
      fireEvent.click(screen.getByText('Done'));

      expect(screen.getByText('Capability contract')).toBeInTheDocument();
      expect(screen.getAllByText('Tool use').length).toBeGreaterThanOrEqual(1);
    });

    it('adds an example from the examples section', () => {
      fireEvent.click(screen.getByText('Examples & tests'));
      fireEvent.click(screen.getByText('Add example'));
      expect(screen.getAllByText('Examples (1)').length).toBeGreaterThanOrEqual(1);
    });

    it('closes on Done', () => {
      fireEvent.click(screen.getByText('Done'));
      expect(screen.queryByPlaceholderText('Clinical Note Summarizer')).not.toBeInTheDocument();
    });
  });

  describe('Spec canvas', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('shows the capability contract with an empty state', () => {
      expect(screen.getByText('Capability contract')).toBeInTheDocument();
      expect(screen.getByText(/any model can invoke this skill/i)).toBeInTheDocument();
    });

    it('shows empty examples and tests', () => {
      expect(screen.getByText('Examples (0)')).toBeInTheDocument();
      expect(screen.getByText('Tests (0)')).toBeInTheDocument();
    });

    it('opens the drawer at the section behind a readiness chip', () => {
      fireEvent.click(screen.getByText('○ Prompt template'));
      expect(screen.getByPlaceholderText('What job should this skill own?')).toBeInTheDocument();
    });
  });

  describe('Architecture graph', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('explains that a basic skill has no architecture', () => {
      fireEvent.click(screen.getByText('Architecture'));
      expect(screen.getByText('This is a basic skill')).toBeInTheDocument();
    });

    it('draws the dependency graph once the skill is meta', async () => {
      mockResolveSkillDependencies.mockResolvedValue([
        { ...mockSkill, id: '@testauthor/dep-one', name: 'Dep One', dependencies: [] },
      ]);

      fireEvent.click(screen.getByText('Settings'));
      fireEvent.click(screen.getByText('Composition'));
      fireEvent.change(screen.getByPlaceholderText(/@skillauthor\/dialogue-flow/), {
        target: { value: '@testauthor/dep-one' },
      });
      fireEvent.click(screen.getByText('Done'));

      await waitFor(() => {
        expect(screen.getByText('Meta skill composition')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText('Dep One')).toBeInTheDocument();
      });
      expect(screen.getByText(/1 skill installed alongside/)).toBeInTheDocument();
    });
  });

  describe('Preview pane', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('asks for a save before an unsaved draft can run', () => {
      expect(screen.getByText(/has to be saved first/)).toBeInTheDocument();
      expect(screen.getByText('Run skill')).toBeDisabled();
    });

    it('offers a runtime to preflight against', () => {
      expect(screen.getByText(/text-only model this workspace executes/i)).toBeInTheDocument();
    });
  });

  describe('Auth modal', () => {
    it('opens auth modal on Sign in click', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });
    });

    it('toggles between login and register modes', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Register'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
      });
    });

    it('submits login form', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[1]);
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'password123');
      });
    });

    it('displays auth error on failure', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');
      fireEvent.change(emailInput, { target: { value: 'user@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrong' } });

      fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[1]);
      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('submits register form', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Register'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Name');
      const handleInput = screen.getByPlaceholderText('skillauthor');
      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');

      fireEvent.change(nameInput, { target: { value: 'New User' } });
      fireEvent.change(handleInput, { target: { value: 'newuser' } });
      fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'pass123' } });

      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          'New User',
          'new@test.com',
          'pass123',
          'newuser',
        );
      });
    });

    it('closes auth modal on close button', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));
      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Logout', () => {
    it('logs out', async () => {
      mockGetAuthToken.mockReturnValue('valid-token');
      mockGetCurrentUser.mockResolvedValue({ user: mockUser });
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sign out'));

      await waitFor(() => {
        expect(mockClearAuthToken).toHaveBeenCalled();
      });
    });
  });

  describe('Error banner', () => {
    it('displays error when server unreachable', async () => {
      mockListSkills.mockRejectedValue(new Error('Server unreachable'));
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitFor(() => {
        expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument();
      });
    });
  });

  describe('Browse page', () => {
    it('opens browse page from workspace Browse button', async () => {
      mockListSkills.mockResolvedValue({ skills: [mockSkill], total: 1 });
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();

      fireEvent.click(screen.getByText('Browse'));
      await waitFor(() => {
        expect(screen.getByText('Browse skills')).toBeInTheDocument();
      });
    });

    it('searches browse page', async () => {
      mockListSkills.mockResolvedValue({ skills: [mockSkill], total: 1 });
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();

      fireEvent.click(screen.getByText('Browse'));
      await waitFor(() => {
        expect(screen.getByText('Browse skills')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search skills/);
      fireEvent.change(searchInput, { target: { value: 'Test' } });

      await waitFor(() => {
        expect(mockListSkills).toHaveBeenCalledWith(
          expect.objectContaining({ query: 'Test' }),
        );
      });
    });
  });

  describe('Generated artifact', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('reveals the markdown preview on demand', () => {
      expect(screen.queryByText(/Start writing your skill markdown/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Generated artifact'));
      expect(screen.getByText(/Start writing your skill markdown/)).toBeInTheDocument();
    });

    it('edits the markdown source in the drawer', () => {
      fireEvent.click(screen.getByText('Generated artifact'));
      fireEvent.click(screen.getByText('Edit source'));
      expect(screen.getByText('Parse markdown into the spec')).toBeInTheDocument();
    });
  });
});
