import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProvider } from '../test/render';
import { ColorSchemeToggle } from './ColorSchemeToggle';

describe('ColorSchemeToggle', () => {
  beforeEach(() => window.localStorage.setItem('mantine-color-scheme-value', 'light'));
  afterEach(() => window.localStorage.clear());

  // U3
  it('U3 changes the color scheme from light to dark and back', async () => {
    const user = userEvent.setup();
    renderWithProvider(<ColorSchemeToggle />);
    const root = document.documentElement;
    expect(root).toHaveAttribute('data-mantine-color-scheme', 'light');
    await user.click(screen.getByRole('button', { name: /switch to dark/i }));
    expect(root).toHaveAttribute('data-mantine-color-scheme', 'dark');
    await user.click(screen.getByRole('button', { name: /switch to light/i }));
    expect(root).toHaveAttribute('data-mantine-color-scheme', 'light');
  });
});
