import { screen } from '@testing-library/react';
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
});
