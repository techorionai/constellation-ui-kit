import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProvider } from '../test/render';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('internal secret');
}

describe('ErrorBoundary', () => {
  // U13
  it('U13 shows a general message and Reload, hides the error text, calls onError once', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    renderWithProvider(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('internal secret');
    expect(onError).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('calls window.location.reload once when the user clicks Reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
    try {
      renderWithProvider(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
      vi.restoreAllMocks();
    }
  });
});
