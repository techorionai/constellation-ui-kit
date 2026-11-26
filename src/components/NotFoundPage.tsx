import { Anchor, Center, Stack, Text, Title } from '@mantine/core';

export interface NotFoundPageProps {
  /** Path of the home page. The default is "/". */
  homePath?: string;
  /** Text of the link to the home page. */
  homeLabel?: string;
}

/** Page for a path that does not exist. */
export function NotFoundPage({
  homePath = '/',
  homeLabel = 'Go to the home page',
}: NotFoundPageProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Title order={1}>Page not found</Title>
        <Text c="dimmed">The page that you want does not exist.</Text>
        <Anchor href={homePath}>{homeLabel}</Anchor>
      </Stack>
    </Center>
  );
}
