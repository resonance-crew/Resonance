// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedGrid, type GridSegment } from './SegmentedGrid';

// jsdom lays nothing out: the grid's room and each label's own width are given here.
function lay(room: number, words: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'group' ? room : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'group' ? room : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-label') ? words : 0;
  });
}

afterEach(() => vi.restoreAllMocks());

const segments = (chosen: string, onPick = vi.fn()): GridSegment[] =>
  ['Public', 'Connections', 'Anonymous', 'Private'].map((label) => ({
    key: label.toLowerCase(),
    icon: <svg width={16} height={16} />,
    label,
    pressed: label === chosen,
    onClick: () => onPick(label),
  }));

describe('SegmentedGrid', () => {
  it('stands in one row where each glyph and its whole words fit a quarter', () => {
    lay(640, 80);
    render(<SegmentedGrid segments={segments('Public')} />);
    expect(screen.getByRole('group')).toHaveAttribute('data-cols', '4');
  });

  it('turns 2×2 where a quarter is too little — every cell keeps its glyph and words', () => {
    lay(350, 80);
    render(<SegmentedGrid segments={segments('Public')} />);
    const grid = screen.getByRole('group');
    expect(grid).toHaveAttribute('data-cols', '2');
    for (const name of ['Public', 'Connections', 'Anonymous', 'Private']) {
      const cell = screen.getByRole('button', { name });
      expect(cell.querySelector('svg')).not.toBeNull();
      expect(cell).toHaveTextContent(name);
    }
  });

  it('stacks one to a row when even half the room is too little (the largest text)', () => {
    lay(200, 120);
    render(<SegmentedGrid segments={segments('Public')} />);
    expect(screen.getByRole('group')).toHaveAttribute('data-cols', '1');
  });

  it('is a choice: the chosen cell is pressed, a tap picks another', async () => {
    lay(350, 80);
    const pick = vi.fn();
    render(<SegmentedGrid segments={segments('Connections', pick)} />);
    expect(screen.getByRole('button', { name: 'Connections' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Anonymous' }));
    expect(pick).toHaveBeenCalledWith('Anonymous');
  });
});
