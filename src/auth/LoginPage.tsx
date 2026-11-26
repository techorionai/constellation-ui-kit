import { Alert, Button, Center, Stack, Text, Title } from '@mantine/core';
import { useAuthContext, useAuth } from './AuthProvider';
import { errorText } from './types';

export interface LoginPageProps {
  /** Overrides the `appName` of `AuthProvider`. */
  appName?: string;
}

/**
 * The page for a user who is not logged in. It has no form fields. The login steps
 * (password, TOTP, passkeys, Google, and Microsoft) are on the hosted pages of identity.
 */
export function LoginPage({ appName }: LoginPageProps) {
  const context = useAuthContext();
  const auth = useAuth();
  return (
    <Center py="xl">
      <Stack align="center" gap="md" maw={420}>
        <Title order={1} ta="center">
          {appName ?? context.appName}
        </Title>
        <Text ta="center">Log in to continue.</Text>
        {auth.error ? (
          <Alert color="red" variant="light" title="Login failed" role="alert">
            {errorText(auth.error)}
          </Alert>
        ) : null}
        <Button onClick={() => void auth.login()}>Log in</Button>
      </Stack>
    </Center>
  );
}
