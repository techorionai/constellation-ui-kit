import { useEffect, useState } from 'react';
import { Alert, Button, Center, Stack } from '@mantine/core';
import { LoadingState } from '../components/LoadingState';
import { useAuthContext } from './AuthProvider';
import { errorText, type AuthError } from './types';

interface Failure {
  error: AuthError;
  returnTo: string;
}

/** The component of the callback route. It checks the response and exchanges the code. */
export function AuthCallback() {
  const { controller } = useAuthContext();
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let cancelled = false;
    void controller.completeCallback().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === 'error') {
        setFailure({ error: outcome.error, returnTo: outcome.returnTo });
        return;
      }
      controller.finishCallback(outcome.returnTo);
    });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  if (!failure) return <LoadingState text="Logging in" />;
  return (
    <Center py="xl">
      <Stack maw={480}>
        <Alert color="red" variant="light" title="Login failed" role="alert">
          {errorText(failure.error)}
        </Alert>
        <Button onClick={() => void controller.login(failure.returnTo)}>Try again</Button>
      </Stack>
    </Center>
  );
}
