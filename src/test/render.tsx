import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { ConstellationProvider } from '../theme/ConstellationProvider';

/** Render a component inside the kit provider. */
export function renderWithProvider(ui: ReactElement) {
  return render(<ConstellationProvider>{ui}</ConstellationProvider>);
}
