import { Center, Loader, Stack, Text } from '@mantine/core';

export interface LoadingStateProps {
  /** Visible text. The default is "Loading". */
  text?: string;
}

/** Centered loader with a visible text. */
export function LoadingState({ text = 'Loading' }: LoadingStateProps) {
  return (
    <Center py="xl" role="status">
      <Stack align="center" gap="xs">
        <Loader aria-hidden="true" />
        <Text>{text}</Text>
      </Stack>
    </Center>
  );
}
