import { render, screen } from '@testing-library/react';
import { useMantineTheme } from '@mantine/core';
import { ConstellationProvider } from './ConstellationProvider';

function ThemeProbe() {
  const theme = useMantineTheme();
  return (
    <p data-testid="probe">
      {theme.primaryColor}|{theme.defaultRadius}
    </p>
  );
}

describe('ConstellationProvider', () => {
  // U1
  it('U1 sets the color scheme attribute and the kit primary color', () => {
    render(
      <ConstellationProvider>
        <ThemeProbe />
      </ConstellationProvider>,
    );
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme');
    expect(screen.getByTestId('probe')).toHaveTextContent('constellation|md');
  });

  // U2
  it('U2 merges a theme override and keeps other kit values', () => {
    render(
      <ConstellationProvider theme={{ primaryColor: 'teal' }}>
        <ThemeProbe />
      </ConstellationProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('teal|md');
  });
});
