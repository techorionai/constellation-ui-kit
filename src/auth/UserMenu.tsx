import { Avatar, Menu, Text, UnstyledButton } from '@mantine/core';
import { useAuth, useAuthContext } from './AuthProvider';

function initials(name: string | undefined, email: string | undefined, sub: string): string {
  const source = (name ?? email ?? sub).trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : source.slice(0, 2);
  return letters.toUpperCase();
}

/** Avatar menu for the header: the user, a link to the account page, and "Log out". */
export function UserMenu() {
  const { issuer } = useAuthContext();
  const { status, user, logout } = useAuth();
  if (status !== 'authenticated' || !user) return null;
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label="User menu">
          <Avatar color="blue" radius="xl" aria-hidden="true">
            {initials(user.name, user.email, user.sub)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={600} component="span" display="block">
            {user.name ?? user.email ?? user.sub}
          </Text>
          {user.name && user.email ? (
            <Text size="xs" component="span" display="block">
              {user.email}
            </Text>
          ) : null}
        </Menu.Label>
        <Menu.Item
          component="a"
          href={`${issuer}/account/security`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Account security
        </Menu.Item>
        <Menu.Item onClick={() => void logout()}>Log out</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
