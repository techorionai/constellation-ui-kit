import type { ReactNode } from 'react';
import { Center, Stack, Text, Title } from '@mantine/core';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** Heading level of the title. The default is 2. */
  titleOrder?: 2 | 3 | 4;
  text?: ReactNode;
  action?: ReactNode;
}

/** Message for a list or a page that has no content. */
export function EmptyState({ icon, title, titleOrder = 2, text, action }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" ta="center">
        {icon}
        <Title order={titleOrder}>{title}</Title>
        {text ? <Text c="dimmed">{text}</Text> : null}
        {action}
      </Stack>
    </Center>
  );
}
