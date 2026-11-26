import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProvider } from '../test/render';
import { ConfirmAction } from './ConfirmAction';
import type { Problem } from '../api/problem';

function setup(onConfirm: () => Promise<void> | void) {
  const user = userEvent.setup();
  renderWithProvider(
    <ConfirmAction label="Delete" message="Delete this item?" onConfirm={onConfirm} />,
  );
  return user;
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  return screen.findByRole('dialog');
}

describe('ConfirmAction', () => {
  // U10
  it('U10 closes on Cancel and does not call onConfirm', async () => {
    const onConfirm = vi.fn();
    const user = setup(onConfirm);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // U11
  it('U11 shows a loader while the promise runs, then closes', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const user = setup(onConfirm);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveAttribute('data-loading', 'true');
    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // U12
  it('U12 shows the Problem when onConfirm rejects with one', async () => {
    const problem: Problem = {
      type: 'about:blank',
      title: 'Ticket is locked',
      status: 409,
      code: 'ticket_locked',
    };
    const user = setup(() => Promise.reject(problem));
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Ticket is locked')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // U19
  it('U19 shows a general problem and no error text for an Error', async () => {
    const user = setup(() => Promise.reject(new Error('secret text')));
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Request failed')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('secret text');
  });

  // U20
  it('U20 calls onConfirm one time for two clicks and disables the buttons', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const user = setup(onConfirm);
    await open(user);
    const cont = screen.getByRole('button', { name: 'Continue' });
    await user.click(cont);
    await user.click(cont);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
