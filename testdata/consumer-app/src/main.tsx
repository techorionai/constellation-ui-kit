import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@techorionai/constellation-ui-kit/styles.css';
import { AuthApp } from './AuthApp';
import {
  AppLayout,
  ConfirmAction,
  ConstellationProvider,
  EmptyState,
  ErrorBoundary,
  LoadingState,
  PageHeader,
  ProblemAlert,
  type Problem,
} from '@techorionai/constellation-ui-kit';

const problem: Problem = {
  type: 'about:blank',
  title: 'Invalid request',
  status: 400,
  code: 'validation_failed',
  detail: 'Check the fields.',
  requestId: 'req-1',
  errors: [{ field: '/name', code: 'required', message: 'Name is required.' }],
};

function Demo() {
  return (
    <ConstellationProvider>
      <ErrorBoundary>
        <AppLayout
          appName="Consumer app"
          navItems={[
            { label: 'Tickets', path: '#tickets' },
            { label: 'Users', path: '#users' },
          ]}
        >
          <PageHeader title="Tickets" description="Example page" />
          <LoadingState />
          <EmptyState title="No tickets" text="Make a ticket to start." />
          <ProblemAlert problem={problem} />
          <ConfirmAction label="Delete" message="Delete this item?" onConfirm={() => {}} danger />
        </AppLayout>
      </ErrorBoundary>
    </ConstellationProvider>
  );
}

// With VITE_ISSUER the app uses the login flow. Without it, the app shows the pages of the kit only.
const issuer = import.meta.env.VITE_ISSUER as string | undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{issuer ? <AuthApp issuer={issuer} /> : <Demo />}</StrictMode>,
);
