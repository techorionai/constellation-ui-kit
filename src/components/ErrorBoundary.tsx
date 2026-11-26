import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';

export interface ErrorBoundaryProps {
  children?: ReactNode;
  /** Called one time for each error. Use it to send the error to a log. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/** React error boundary. It never shows the error text to the user. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Center py="xl" role="alert">
        <Stack align="center" gap="xs">
          <Title order={2}>Something went wrong</Title>
          <Text c="dimmed">An error stopped this page. Reload the page to try again.</Text>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Center>
    );
  }
}
