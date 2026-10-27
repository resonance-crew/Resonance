// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, fireEvent } from '@/../test/render';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inkBrushes, stubRowLayout, type RowLayout } from '@/../test/layout';
import { Select } from './Field';

// Passed directly as children, the way a native <select> takes <option>s.
const OPTIONS = [
  <option key="tw" value="tw">Taiwan</option>,
  <option key="jp" value="jp">Japan</option>,
  <option key="us" value="us">United States</option>,
  <option key="kr" value="kr">Korea</option>,
];

describe('Select (organic dropdown)', () => {
  it('shows the selected option label in the closed trigger', () => {
    render(
      <Select value="jp" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Japan');
  });

  it('expands a covering card listing every option', async () => {
    render(
      <Select value="tw" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveAttribute('aria-expanded', 'true');
    // All N options are listed on the open sheet.
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('marks the current value as selected', async () => {
    render(
      <Select value="us" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    expect(screen.getByRole('option', { name: /United States/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('calls onChange with the chosen value and closes', async () => {
    const onChange = vi.fn();
    render(
      <Select value="tw" onChange={onChange} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    await userEvent.click(screen.getByRole('option', { name: 'Korea' }));
    expect(onChange).toHaveBeenCalledWith('kr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// Round 17 review D6: the open list is the one menu sheet — paper and grain, no pen round it and none between its
// rows, rows 44, the spreading ink cut to each row's band; a pointer's opening inks no row.
describe('Select row ink', () => {
  let layout: RowLayout;

  beforeEach(() => {
    layout = stubRowLayout({ width: 240, rowHeight: 44 });
  });
  afterEach(() => layout.restore());

  const openSelect = async (value = 'jp', how: 'pointer' | 'keyboard' = 'pointer') => {
    render(
      <Select value={value} onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    if (how === 'pointer') await userEvent.click(trigger);
    else {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
    }
    return trigger;
  };
  const inked = () => inkBrushes().map((b) => b.on);

  it('lies on the menu sheet: paper and grain, no pen line, no dividers, rows 44', async () => {
    await openSelect('jp');
    const panel = screen.getByRole('listbox').parentElement!;
    expect(panel.querySelector('path[fill="var(--sheet-paper)"]')).not.toBeNull();
    expect(panel.querySelector('path[stroke]')).toBeNull();
    // 6 of paper over the first row and under the last, 44 a row.
    expect(panel.style.height).toBe(`${6 + 4 * 44 + 6}px`);
    const css = readFileSync(join(process.cwd(), 'src/components/atoms/Field/Field.module.css'), 'utf8');
    const row = css.slice(css.indexOf('.dropdownOption {'));
    expect(row).toMatch(/height: 44px;/);
    expect(row).toMatch(/padding: 0 20px;/);
    // The ink of every row is the menus' one, cut to its band inside the sheet's wobble.
    const ink = inkBrushes();
    expect(ink).toHaveLength(4);
    expect(new Set(ink.map((b) => b.color)).size).toBe(1);
    expect(ink[0].color).toContain('15%');
    for (const b of ink) expect(b.band).toMatch(/^path\('M .* C .* Z'\)$/);
  });

  it('inks no row when a pointer opens it', async () => {
    await openSelect('jp');
    expect(inked()).toEqual([false, false, false, false]);
  });

  it('starts the keyboard on the chosen option, from its centre', async () => {
    await openSelect('jp', 'keyboard');
    expect(inked()).toEqual([false, true, false, false]);
    expect(inkBrushes()[1]).toMatchObject({ cx: 120, cy: 6 + 44 + 22 });
  });

  it('spreads from the pointer onto the hovered option', async () => {
    await openSelect('jp');
    const korea = screen.getByRole('option', { name: 'Korea' });
    fireEvent.mouseEnter(korea, { clientX: 40, clientY: 150 });

    expect(inked()).toEqual([false, false, false, true]);
    expect(inkBrushes()[3]).toMatchObject({ cx: 40, cy: 150 });
    expect(korea).toHaveAttribute('data-active');
  });

  it('withdraws the ink once the pointer leaves, keeping the option it was on for the keyboard', async () => {
    const trigger = await openSelect('tw');
    const us = screen.getByRole('option', { name: 'United States' });
    fireEvent.mouseEnter(us, { clientX: 40, clientY: 120 });
    fireEvent.mouseLeave(us);

    expect(inked()).toEqual([false, false, false, false]);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(us.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(inked()).toEqual([false, false, false, true]);
  });

  it('moves the ink down with ArrowDown and up with ArrowUp, from each row\'s centre', async () => {
    const trigger = await openSelect('tw', 'keyboard');
    expect(inked()).toEqual([true, false, false, false]);

    await userEvent.keyboard('{ArrowDown}');
    expect(inked()).toEqual([false, true, false, false]);
    expect(inkBrushes()[1]).toMatchObject({ cx: 120, cy: 6 + 44 + 22 });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Japan' }).id,
    );

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(inked()).toEqual([false, false, false, true]);

    await userEvent.keyboard('{ArrowUp}');
    expect(inked()).toEqual([false, false, true, false]);
  });

  it('lets the keyboard take the ink back from a pointer resting on another row', async () => {
    await openSelect('tw');
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Japan' }), { clientX: 30, clientY: 70 });
    expect(inked()).toEqual([false, true, false, false]);

    await userEvent.keyboard('{ArrowDown}');
    expect(inked()).toEqual([false, false, true, false]);
  });

  it('leaves the chosen option its own words and ✓ wherever the ink is', async () => {
    await openSelect('jp');
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Korea' }), { clientX: 10, clientY: 160 });
    const japan = screen.getByRole('option', { name: 'Japan' });
    const korea = screen.getByRole('option', { name: 'Korea' });
    // Only the hover/keyboard wash moved; "selected" is still Japan's alone.
    expect(japan).toHaveAttribute('aria-selected', 'true');
    expect(japan).toHaveAttribute('data-selected');
    expect(korea).toHaveAttribute('aria-selected', 'false');
    expect(korea).not.toHaveAttribute('data-selected');
  });

  it('chooses the keyboard-inked option on Enter', async () => {
    const onChange = vi.fn();
    render(
      <Select value="tw" onChange={onChange} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('us');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
