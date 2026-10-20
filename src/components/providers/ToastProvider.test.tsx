// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TOAST_ACTION_MS, TOAST_MS, ToastProvider, useToast, type ToastOptions } from './ToastProvider';

// The signed-in shell's one toast: a status for 4 s, an action (undo) for 8 s,
// one at a time, held while the pointer or focus is on it, spoken through one
// polite live region, never taking focus.

let toasts: ReturnType<typeof useToast>;
function Page() {
  toasts = useToast();
  return <button type="button">elsewhere</button>;
}

const shell = () =>
  render(
    <ToastProvider>
      <main>
        <Page />
      </main>
    </ToastProvider>,
  );

const show = (options: ToastOptions) => act(() => void toasts.show(options));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
/** The live region every toast speaks through. */
const region = () => screen.getByRole('status');
/** The toast's face (its words are hidden from assistive tech: the region says them). */
const face = () => document.querySelector('[data-size="md"]');

const undo = (onAction = vi.fn()) => ({
  message: '已移到垃圾桶',
  announce: '雨天已移到垃圾桶',
  action: { label: '復原', ariaLabel: '已移到垃圾桶 · 復原雨天', onAction },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ToastProvider', () => {
  it('says a status for 4 s through its one live region, and never takes focus', () => {
    shell();
    // Mounted before any toast, so the first one is heard too.
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region()).toBeEmptyDOMElement();

    show({ message: '已還原' });
    expect(region()).toHaveTextContent('已還原');
    expect(face()).toHaveTextContent('已還原');
    expect(face()).toHaveAttribute('aria-hidden', 'true');
    expect(document.activeElement).toBe(document.body);
    // The one status on the page: the face says nothing of its own.
    expect(screen.getAllByRole('status')).toHaveLength(1);

    wait(TOAST_MS - 1);
    expect(face()).not.toBeNull();
    wait(1);
    // Cleared at once; the face fades out and is gone.
    expect(region()).toBeEmptyDOMElement();
    wait(200);
    expect(face()).toBeNull();
  });

  it('offers its action for 8 s, the whole pill the button, named with its words first', () => {
    shell();
    const onAction = vi.fn();
    show(undo(onAction));
    const button = screen.getByRole('button', { name: '已移到垃圾桶 · 復原雨天' });
    expect(button).toHaveTextContent('已移到垃圾桶 · 復原');
    expect(region()).toHaveTextContent('雨天已移到垃圾桶');

    wait(TOAST_ACTION_MS - 1);
    expect(screen.getByRole('button', { name: /復原/ })).toBeInTheDocument();
    wait(1);
    wait(200);
    expect(screen.queryByRole('button', { name: /復原/ })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();

    show(undo(onAction));
    fireEvent.click(screen.getByRole('button', { name: /復原/ }));
    expect(onAction).toHaveBeenCalledOnce();
    // Acted on, it goes.
    expect(region()).toBeEmptyDOMElement();
  });

  it('replaces the toast showing with a new one, which keeps its own time', () => {
    shell();
    show(undo());
    wait(3_000);
    show({ message: '已還原' });
    expect(screen.queryByRole('button', { name: /復原/ })).toBeNull();
    expect(region()).toHaveTextContent('已還原');
    expect(document.querySelectorAll('[data-size="md"]')).toHaveLength(1);
    // The first one's 8 s would have ended at 8 000; the new one's 4 s run from 3 000.
    wait(TOAST_MS - 1);
    expect(face()).toHaveTextContent('已還原');
    wait(1);
    expect(region()).toBeEmptyDOMElement();
  });

  it('says the same words twice when shown twice', () => {
    shell();
    show({ message: '已複製連結' });
    const first = region().firstElementChild;
    show({ message: '已複製連結' });
    expect(region()).toHaveTextContent('已複製連結');
    // A new node for the new toast: a screen reader hears it again.
    expect(region().firstElementChild).not.toBe(first);
  });

  it('holds while the pointer is over it, and resumes with at least 2 s left', () => {
    shell();
    show({ message: '已還原' });
    wait(3_500);
    fireEvent.pointerEnter(face()!.parentElement!);
    wait(30_000);
    expect(face()).toHaveTextContent('已還原');
    fireEvent.pointerLeave(face()!.parentElement!);
    // 500 ms were left; it resumes with 2 s.
    wait(1_999);
    expect(region()).toHaveTextContent('已還原');
    wait(1);
    expect(region()).toBeEmptyDOMElement();
  });

  it('holds while focus is in it, and Escape there takes it down', () => {
    shell();
    show(undo());
    const button = screen.getByRole('button', { name: /復原/ });
    act(() => button.focus());
    wait(60_000);
    expect(screen.getByRole('button', { name: /復原/ })).toBeInTheDocument();

    // Focus leaving lets it go on, with at least 2 s.
    act(() => screen.getByRole('button', { name: 'elsewhere' }).focus());
    wait(TOAST_ACTION_MS - 1);
    expect(screen.getByRole('button', { name: /復原/ })).toBeInTheDocument();
    wait(1);
    expect(region()).toBeEmptyDOMElement();

    show(undo());
    act(() => screen.getByRole('button', { name: /復原/ }).focus());
    fireEvent.keyDown(screen.getByRole('button', { name: /復原/ }), { key: 'Escape' });
    expect(region()).toBeEmptyDOMElement();
    wait(200);
    expect(screen.queryByRole('button', { name: /復原/ })).toBeNull();
  });

  it('is taken down by its id, and not by an id that has gone', () => {
    shell();
    let first = 0;
    act(() => void (first = toasts.show({ message: 'one' })));
    show({ message: 'two' });
    act(() => toasts.dismiss(first));
    expect(region()).toHaveTextContent('two');
    act(() => toasts.dismiss());
    expect(region()).toBeEmptyDOMElement();
  });

  it('drops a toast outside the shell', () => {
    render(<Page />);
    expect(() => act(() => void toasts.show({ message: '已還原' }))).not.toThrow();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
