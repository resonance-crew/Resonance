// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

// The stage's chunk: a marker in its place, so the test sees whether the page asked for it.
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="stage-layer" /> }));

import { ReadingStage } from './ReadingStage';

describe('ReadingStage', () => {
  afterEach(() => localStorage.clear());

  const idle = async () => {
    // whenIdle: the page has loaded, then the browser's idle moment (a timer in jsdom).
    await act(() => new Promise((r) => setTimeout(r, 400)));
  };

  it('loads nothing until the reader turns the puppets on', async () => {
    const { queryByTestId } = render(<ReadingStage />);
    await idle();
    expect(queryByTestId('stage-layer')).toBeNull();
  });

  it('comes once turned on, and not for a page that says not now', async () => {
    localStorage.setItem('resonance-tweaks', JSON.stringify({ mascots: true }));
    const on = render(<ReadingStage />);
    await vi.waitFor(() => expect(on.queryByTestId('stage-layer')).not.toBeNull());
    on.unmount();
    const off = render(<ReadingStage off />);
    await idle();
    expect(off.queryByTestId('stage-layer')).toBeNull();
  });
});
