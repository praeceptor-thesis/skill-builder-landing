import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from '../App';

function renderWithProviders(ui: React.ReactElement, { initialEntries = ['/'] } = {}) {
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
  () => vi.fn((skill: { id: string; authorHandle?: string }) => {
    const prefix = skill.authorHandle ? `@${skill.authorHandle}/` : '';
    return `npx skill-builder install ${prefix}${skill.id}`;
  }),
);
const mockGetSkill = vi.hoisted(() => vi.fn());

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
  const buttons = screen.getAllByText('Build a Skill');
  fireEvent.click(buttons[0]);
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
      expect(screen.getByText('Reusable AI skills')).toBeInTheDocument();
      expect(screen.getByText('for agents and teams')).toBeInTheDocument();
      expect(screen.getByText('Browse Registry →')).toBeInTheDocument();
      const buildSkillButtons = screen.getAllByText('Build a Skill');
      expect(buildSkillButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows three feature cards', () => {
      renderWithProviders(<App />);
      expect(screen.getByText('Browse')).toBeInTheDocument();
      expect(screen.getByText('Author')).toBeInTheDocument();
      expect(screen.getByText('Execute')).toBeInTheDocument();
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
      fireEvent.click(screen.getAllByText('Build a Skill')[0]);
      await waitForWorkspace();
    });

    it('navigates to browse page from landing', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Browse Registry →'));
      await waitFor(() => {
        expect(screen.getByText('Browse Skills')).toBeInTheDocument();
      });
    });

    it('navigates back to landing from workspace', async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();

      fireEvent.click(screen.getByText(/\u2190 skill builder/));
      await waitFor(() => {
        expect(screen.getByText('Reusable AI skills')).toBeInTheDocument();
      });
    });

    it('opens architect from Author card', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Open Architect →'));
      await waitForWorkspace();
    });

    it('opens browse page from Execute card', async () => {
      renderWithProviders(<App />);
      fireEvent.click(screen.getByText('Choose a Skill →'));
      await waitFor(() => {
        expect(screen.getByText('Browse Skills')).toBeInTheDocument();
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

    it('renders Runtime package sidebar', () => {
      expect(screen.getByText('Runtime package')).toBeInTheDocument();
      expect(screen.getByText('Generated artifacts')).toBeInTheDocument();
    });

    it('renders Save, Publish, Fork buttons', () => {
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('renders build pipeline activity log', () => {
      expect(screen.getByText('Build pipeline')).toBeInTheDocument();
      expect(screen.getByText('Skill Architect ready')).toBeInTheDocument();
    });

    it('shows editor mode toggles', () => {
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('Split')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
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
      fireEvent.click(screen.getByText('Build / update skill'));

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).toHaveBeenCalledWith(
          expect.objectContaining({ intent: 'Build a summarizer skill' }),
        );
      });
    });

    it('shows user message after sending', async () => {
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Build a parser skill' } });
      fireEvent.click(screen.getByText('Build / update skill'));

      await waitFor(() => {
        expect(screen.getByText('Build a parser skill')).toBeInTheDocument();
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
      const sendButton = screen.getByText('Build / update skill');
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockCreateSkillBuilderSession).not.toHaveBeenCalled();
      });
    });

    it('handles architect error', async () => {
      mockCreateSkillBuilderSession.mockRejectedValue(new Error('API unavailable'));
      const input = screen.getByPlaceholderText(/Build a skill that extracts/);
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByText('Build / update skill'));

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
      fireEvent.click(screen.getByText('Build / update skill'));

      const button = screen.getByText('Building...');
      expect(button).toBeDisabled();
    });
  });

  describe('SkillSpec editor fields', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('displays skill spec fields', () => {
      expect(screen.getByPlaceholderText('Medicare Billing Extractor')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('cms, billing, medical')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('What job should this skill own?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Identify the user intent/)).toBeInTheDocument();
    });

    it('updates skill name on input', () => {
      const nameInput = screen.getByPlaceholderText('Medicare Billing Extractor');
      fireEvent.change(nameInput, { target: { value: 'Custom Skill Name' } });
      expect(nameInput).toHaveValue('Custom Skill Name');
    });

    it('shows examples section', () => {
      expect(screen.getByText('Examples')).toBeInTheDocument();
      expect(screen.getByText(/No examples yet/)).toBeInTheDocument();
    });

    it('shows tests section', () => {
      expect(screen.getByText('Tests')).toBeInTheDocument();
      expect(screen.getByText(/No tests yet/)).toBeInTheDocument();
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
        expect(screen.getByText('Create account')).toBeInTheDocument();
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
        expect(screen.getByText('Create account')).toBeInTheDocument();
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
        expect(mockRegister).toHaveBeenCalledWith('New User', 'new@test.com', 'pass123', 'newuser');
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
        expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
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
        expect(screen.getByText('Browse Skills')).toBeInTheDocument();
      });
    });

    it('searches browse page', async () => {
      mockListSkills.mockResolvedValue({ skills: [mockSkill], total: 1 });
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();

      fireEvent.click(screen.getByText('Browse'));
      await waitFor(() => {
        expect(screen.getByText('Browse Skills')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by name/);
      fireEvent.change(searchInput, { target: { value: 'Test' } });

      await waitFor(() => {
        expect(mockListSkills).toHaveBeenCalledWith(
          expect.objectContaining({ query: 'Test' }),
        );
      });
    });
  });

  describe('Editor mode switching', () => {
    beforeEach(async () => {
      renderWithProviders(<App />);
      navigateToWorkspace();
      await waitForWorkspace();
    });

    it('switches to Source (edit) mode', () => {
      fireEvent.click(screen.getByText('Source'));
      expect(screen.getByText('Generated markdown')).toBeInTheDocument();
    });

    it('switches to Preview mode', () => {
      fireEvent.click(screen.getAllByText('Preview')[0]);
      expect(screen.getAllByText('Preview').length).toBeGreaterThanOrEqual(1);
    });

    it('switches back to Split mode', () => {
      fireEvent.click(screen.getByText('Source'));
      fireEvent.click(screen.getByText('Split'));
      expect(screen.getByText('Source')).toBeInTheDocument();
    });
  });
});
