import type { ReactNode } from 'react';
import { Group, Stack, Text, Title } from '@mantine/core';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Slot for page actions, for example a button. */
  actions?: ReactNode;
}

/** Page title with an optional description and an actions slot. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
      <Stack gap={4}>
        <Title order={1}>{title}</Title>
        {description ? <Text c="dimmed">{description}</Text> : null}
      </Stack>
      {actions ? <Group>{actions}</Group> : null}
    </Group>
  );
}
