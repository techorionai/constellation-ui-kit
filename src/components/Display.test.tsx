import { screen } from '@testing-library/react';
import { renderWithProvider } from '../test/render';
import { PageHeader } from './PageHeader';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ProblemAlert } from './ProblemAlert';
import { NotFoundPage } from './NotFoundPage';

describe('display components', () => {
  // U6
  it('U6 renders PageHeader with one h1 and the actions', () => {
    renderWithProvider(<PageHeader title="Tickets" actions={<button>New</button>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tickets');
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  // U7
  it('U7 renders LoadingState with role status and text', () => {
    renderWithProvider(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  // U8
  it('U8 renders EmptyState with title, text, and action', () => {
    renderWithProvider(
      <EmptyState title="No tickets" text="Make a ticket." action={<button>Make</button>} />,
    );
    expect(screen.getByText('No tickets')).toBeInTheDocument();
    expect(screen.getByText('Make a ticket.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make' })).toBeInTheDocument();
  });

  // U9
  it('U9 renders ProblemAlert with field errors and the request ID only', () => {
    const { container } = renderWithProvider(
      <ProblemAlert
        problem={{
          type: 'about:blank',
          title: 'Invalid request',
          status: 400,
          code: 'validation_failed',
          detail: 'Two fields are wrong.',
          requestId: 'req-42',
          traceId: 'trace-secret',
          errors: [
            { field: '/name', code: 'required', message: 'Name is required.' },
            { field: '/email', code: 'format', message: 'Email is not valid.' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Invalid request')).toBeInTheDocument();
    expect(screen.getByText('Two fields are wrong.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('req-42')).toBeInTheDocument();
    expect(container.textContent).not.toContain('trace-secret');
    expect(container.textContent).not.toContain('validation_failed');
  });

  it('renders NotFoundPage with a link to the home path', () => {
    renderWithProvider(<NotFoundPage homePath="/home" />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/home');
  });
});
