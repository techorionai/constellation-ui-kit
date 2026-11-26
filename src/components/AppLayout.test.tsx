import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProvider } from '../test/render';
import { AppLayout, type NavItem } from './AppLayout';

const items: NavItem[] = [
  { label: 'Tickets', path: '/tickets' },
  { label: 'Users', path: '/users' },
  { label: 'Settings', path: '/settings' },
];

describe('AppLayout', () => {
  // U4
  it('U4 renders the links through renderLink and the headerRight slot', () => {
    renderWithProvider(
      <AppLayout
        appName="Helpdesk"
        navItems={items}
        renderLink={(item) => (
          <a href={item.path} data-custom="yes">
            {item.label}
          </a>
        )}
        headerRight={<span>User menu</span>}
      >
        <p>Content</p>
      </AppLayout>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    links.forEach((link) => expect(link).toHaveAttribute('data-custom', 'yes'));
    expect(screen.getByText('User menu')).toBeInTheDocument();
    expect(screen.getByText('Helpdesk')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  // U5
  it('U5 opens the navbar with the burger button', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: query.includes('max-width'),
    })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      renderWithProvider(<AppLayout appName="Helpdesk" navItems={items} />);
      const burger = screen.getByLabelText('Toggle navigation');
      const navbar = screen.getByRole('navigation', { hidden: true });
      expect(burger).toHaveAttribute('aria-expanded', 'false');
      expect(navbar).toHaveAttribute('inert');
      await user.click(burger);
      expect(burger).toHaveAttribute('aria-expanded', 'true');
      expect(navbar).not.toHaveAttribute('inert');
    } finally {
      window.matchMedia = original;
    }
  });
});
