// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BAND_HOVER_MIX, BAND_PRESS_DELAY_MS, BAND_PRESS_MIX } from '@/lib/design/listBands';
import { BandWash, bandHost, useBandPress } from './BandWash';

// A band's press (round 23 §4): on only after the finger has stayed a moment, gone the moment the list scrolls — so a
// scroll that starts on a row never flickers it — and a quick tap still shows it for as long.

function Row() {
  const press = useBandPress();
  return (
    <a href="#row" className={bandHost} data-testid="row" {...press}>
      <BandWash topKey="a" bottomKey="b" />
      words
    </a>
  );
}

const pressed = () => screen.getByTestId('row').hasAttribute('data-band-pressed');

describe('useBandPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the band only once a press has lasted the delay, and takes it away on lifting', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(BAND_PRESS_DELAY_MS - 1));
    expect(pressed()).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(pressed()).toBe(true);
    fireEvent.pointerUp(row);
    expect(pressed()).toBe(false);
    // A finger's leave comes after its lift and changes nothing.
    fireEvent.pointerLeave(row);
    expect(pressed()).toBe(false);
  });

  it('shows nothing when a scroll starts: the browser taking the touch, anything scrolling, a finger wandering off', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(row);
    act(() => vi.advanceTimersByTime(200));
    expect(pressed()).toBe(false);

    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(BAND_PRESS_DELAY_MS));
    expect(pressed()).toBe(true);
    fireEvent.scroll(window);
    expect(pressed()).toBe(false);
    // The scroll ended the press: lifting afterwards shows no flash.
    fireEvent.pointerUp(row);
    expect(pressed()).toBe(false);

    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(row, { clientX: 10, clientY: 30 });
    act(() => vi.advanceTimersByTime(200));
    expect(pressed()).toBe(false);
  });

  it('shows a quick tap for as long as the delay, then lets it go', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(20));
    fireEvent.pointerUp(row);
    expect(pressed()).toBe(true);
    act(() => vi.advanceTimersByTime(BAND_PRESS_DELAY_MS));
    expect(pressed()).toBe(false);
  });

  it('ignores a secondary button', () => {
    render(<Row />);
    fireEvent.pointerDown(screen.getByTestId('row'), { button: 2 });
    act(() => vi.advanceTimersByTime(200));
    expect(pressed()).toBe(false);
  });
});

describe('the band’s wash', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/atoms/BandWash/BandWash.module.css'), 'utf8');

  it('is nothing at rest, 6 % under a fine pointer and 12 % pressed — never on :active', () => {
    expect(css).toMatch(/\.host \{\s*--band-fill: transparent;/);
    expect(css).toMatch(
      new RegExp(`@media \\(hover: hover\\) and \\(pointer: fine\\) \\{\\s*\\.host:hover \\{\\s*--band-fill: color-mix\\(in oklch, var\\(--toward-ink\\) ${BAND_HOVER_MIX}%, transparent\\);`),
    );
    expect(css).toMatch(new RegExp(`\\.host\\[data-band-pressed\\] \\{\\s*--band-fill: color-mix\\(in oklch, var\\(--toward-ink\\) ${BAND_PRESS_MIX}%, transparent\\);`));
    expect(css).not.toMatch(/:active/);
  });

  it('lies under the row’s content over its whole box, its curves drawn past it', () => {
    render(<Row />);
    const band = screen.getByTestId('row').querySelector('[data-band]')!;
    expect(band).toHaveAttribute('aria-hidden');
    expect(css).toMatch(/\.band \{\s*position: absolute;\s*inset: 0;\s*pointer-events: none;/);
    expect(css).toMatch(/\.svg \{[^}]*overflow: visible;/);
  });
});
