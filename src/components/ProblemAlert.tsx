import { Alert, Button, Code, CopyButton, Group, List, Text } from '@mantine/core';
import type { Problem } from '../api/problem';
import classes from './components.module.css';

export interface ProblemAlertProps {
  problem: Problem;
}

/** Shows a `Problem`. It never shows a stack or a raw body. */
export function ProblemAlert({ problem }: ProblemAlertProps) {
  const errors = problem.errors ?? [];
  return (
    <Alert color="red" variant="light" title={problem.title} role="alert">
      {problem.detail ? <Text size="sm">{problem.detail}</Text> : null}
      {errors.length > 0 ? (
        <List size="sm" mt="xs">
          {errors.map((error, index) => (
            <List.Item key={`${error.field}-${index}`}>
              <Code>{error.field}</Code> {error.message}
            </List.Item>
          ))}
        </List>
      ) : null}
      {problem.requestId ? (
        <Group gap="xs" mt="xs">
          <Text size="xs" className={classes.requestId}>
            Request ID: <Code>{problem.requestId}</Code>
          </Text>
          <CopyButton value={problem.requestId}>
            {({ copied, copy }) => (
              <Button variant="subtle" size="compact-xs" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
          </CopyButton>
        </Group>
      ) : null}
    </Alert>
  );
}
