// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandTab } from './CommandTab';

describe('CommandTab', () => {
  it('wires input change, submit and prefill actions', () => {
    const onCommandInputChange = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const onPrefillMetaRun = vi.fn();

    const view = render(
      <CommandTab
        messages={[{ id: 1, role: 'assistant', text: 'Hello' }]}
        isWorking={false}
        commandInput=""
        onCommandInputChange={onCommandInputChange}
        onSubmit={onSubmit}
        onPrefillMetaRun={onPrefillMetaRun}
      />,
    );

    fireEvent.change(screen.getByLabelText('Command input'), { target: { value: '/help' } });
    expect(onCommandInputChange).toHaveBeenCalledWith('/help');

    fireEvent.click(screen.getByRole('button', { name: 'Prefill Meta Run' }));
    expect(onPrefillMetaRun).toHaveBeenCalledTimes(1);

    fireEvent.submit(screen.getByRole('button', { name: 'Run' }).closest('form') as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('disables controls while running', () => {
    const view = render(
      <CommandTab
        messages={[]}
        isWorking
        commandInput="/meta-run ..."
        onCommandInputChange={() => undefined}
        onSubmit={() => undefined}
        onPrefillMetaRun={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Command input')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Running...' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Prefill Meta Run' })).toHaveProperty('disabled', true);
    view.unmount();
  });
});
