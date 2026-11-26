import type { ReactElement } from 'react';
import { axe } from 'vitest-axe';
import { renderWithProvider } from '../test/render';
import { AppLayout } from './AppLayout';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { PageHeader } from './PageHeader';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ProblemAlert } from './ProblemAlert';
import { NotFoundPage } from './NotFoundPage';
import { ConfirmAction } from './ConfirmAction';
import { ErrorBoundary } from './ErrorBoundary';

const problem = {
  type: 'about:blank',
  title: 'Invalid request',
  status: 400,
  code: 'validation_failed',
  detail: 'Check the fields.',
  requestId: 'req-1',
  errors: [{ field: '/name', code: 'required', message: 'Name is required.' }],
};

function Boom(): never {
  throw new Error('x');
}

const cases: Record<string, () => ReactElement> = {
  AppLayout: () => (
    <AppLayout appName="App" navItems={[{ label: 'Home', path: '/' }]}>
      <PageHeader title="Home" description="Text" actions={<button>Act</button>} />
    </AppLayout>
  ),
  ColorSchemeToggle: () => <ColorSchemeToggle />,
  LoadingState: () => <LoadingState />,
  EmptyState: () => <EmptyState title="Empty" text="Nothing here." />,
  ProblemAlert: () => <ProblemAlert problem={problem} />,
  NotFoundPage: () => <NotFoundPage />,
  ConfirmAction: () => <ConfirmAction label="Delete" message="Sure?" onConfirm={() => {}} />,
  ErrorBoundary: () => (
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  ),
};

describe.each(['light', 'dark'])('accessibility in the %s scheme', (scheme) => {
  beforeEach(() => {
    window.localStorage.setItem('mantine-color-scheme-value', scheme);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // U17
  it.each(Object.keys(cases))('U17 %s has no violation', async (name) => {
    const { container } = renderWithProvider(cases[name]!());
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});
