import type { ReactNode } from 'react';
import { AppShell, Burger, Group, NavLink, Text } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import classes from './components.module.css';

export interface NavItem {
  label: string;
  path: string;
  icon?: ReactNode;
}

export interface AppLayoutProps {
  /** Name of the application. It shows in the header. */
  appName: string;
  navItems: NavItem[];
  /** Renders one navigation link. The default is a plain anchor. Use it to plug in a router. */
  renderLink?: (item: NavItem) => ReactNode;
  /** Slot at the right of the header, for example a user menu. */
  headerRight?: ReactNode;
  children?: ReactNode;
}

function defaultRenderLink(item: NavItem): ReactNode {
  return <NavLink component="a" href={item.path} label={item.label} leftSection={item.icon} />;
}

/** Application shell with a header, a navigation bar, and the main area. */
export function AppLayout({
  appName,
  navItems,
  renderLink = defaultRenderLink,
  headerRight,
  children,
}: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure(false);
  // The navbar of a small screen is off screen when closed. Keep it out of the tab order.
  const isSmallScreen = useMediaQuery('(max-width: 47.99em)') ?? false;
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
              aria-expanded={opened}
            />
            <Text fw={700} size="lg">
              {appName}
            </Text>
          </Group>
          <Group wrap="nowrap">
            <ColorSchemeToggle />
            {headerRight}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar
        p="md"
        aria-label="Main navigation"
        component="nav"
        inert={isSmallScreen && !opened}
      >
        {navItems.map((item) => (
          <div key={item.path} className={classes.navItem}>
            {renderLink(item)}
          </div>
        ))}
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
