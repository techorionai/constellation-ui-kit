import { useRef, useState, type ReactNode } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { fallbackProblem, isProblem, type Problem } from '../api/problem';
import { ProblemAlert } from './ProblemAlert';

export interface ConfirmActionProps {
  /** Text of the button that opens the modal. */
  label: string;
  /** Title of the modal. The default is the label. */
  title?: string;
  /** Text of the modal. */
  message: ReactNode;
  /** Runs when the user confirms. A rejection with a `Problem` shows in the modal. */
  onConfirm: () => Promise<void> | void;
  /** True for a destructive action. The confirm button is red. */
  danger?: boolean;
  /** Text of the confirm button. The default is "Continue". */
  confirmLabel?: string;
}

/** Button that asks for a confirmation in a modal before it runs an action. */
export function ConfirmAction({
  label,
  title,
  message,
  onConfirm,
  danger = false,
  confirmLabel = 'Continue',
}: ConfirmActionProps) {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const running = useRef(false);

  const close = () => {
    if (running.current) return;
    setOpened(false);
    setProblem(null);
  };

  const confirm = async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setProblem(null);
    try {
      await onConfirm();
      running.current = false;
      setLoading(false);
      setOpened(false);
    } catch (error) {
      running.current = false;
      setLoading(false);
      setProblem(isProblem(error) ? error : fallbackProblem(0));
    }
  };

  return (
    <>
      <Button color={danger ? 'red.8' : undefined} onClick={() => setOpened(true)}>
        {label}
      </Button>
      <Modal
        opened={opened}
        onClose={close}
        title={title ?? label}
        closeOnClickOutside={!loading}
        closeOnEscape={!loading}
        withCloseButton={!loading}
      >
        <Stack>
          <Text>{message}</Text>
          {problem ? <ProblemAlert problem={problem} /> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button
              color={danger ? 'red.8' : undefined}
              onClick={confirm}
              loading={loading}
              disabled={loading}
            >
              {confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
