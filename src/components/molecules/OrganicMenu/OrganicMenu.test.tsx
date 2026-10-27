// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, fireEvent } from '@/../test/render';
import { inkBrushes, stubRowLayout, type RowLayout } from '@/../test/layout';
import { OrganicMenu, type OrganicMenuItem } from './OrganicMenu';

const ITEMS: OrganicMenuItem[] = [
  { key: 'edit', icon: 'pen', label: 'Edit' },
  { key: 'share', icon: 'globe', label: 'Share' },
  { key: 'delete', icon: 'trash', label: 'Delete', danger: true },
];

const css = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('OrganicMenu row ink', () => {
  let layout: RowLayout;

  beforeEach(() => {
    layout = stubRowLayout({ width: 200, rowHeight: 44 });
  });
  afterEach(() => layout.restore());

  async function openMenu(onChoose = vi.fn()) {
    render(<OrganicMenu items={ITEMS} onChoose={onChoose} label="Manage" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage' }));
    return onChoose;
  }

  it('starts with no ink on any row', async () => {
    await openMenu();
    const ink = inkBrushes();
    expect(ink).toHaveLength(3);
    expect(ink.map((b) => b.on)).toEqual([false, false, false]);
  });

  it('spreads the ink of the hovered row from where the pointer entered', async () => {
    await openMenu();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Share' }), {
      clientX: 30,
      clientY: 60,
    });

    const ink = inkBrushes();
    expect(ink.map((b) => b.on)).toEqual([false, true, false]);
    expect(ink[1]).toMatchObject({ cx: 30, cy: 60 });
    expect(screen.getByRole('menuitem', { name: 'Share' })).toHaveAttribute('data-active');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).not.toHaveAttribute('data-active');
  });

  // Round 17 §1: a press shows the ink too — a finger's spreads from where it landed, at once (a touch screen's
  // mouse events come only after the finger lifts).
  it('spreads the ink from where a finger presses a row', async () => {
    await openMenu();
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Edit' }), { clientX: 50, clientY: 20, pointerType: 'touch' });
    expect(inkBrushes().map((b) => b.on)).toEqual([true, false, false]);
    expect(inkBrushes()[0]).toMatchObject({ cx: 50, cy: 20 });
  });

  it('keeps spreading from where the pointer came in while it wanders along the row', async () => {
    await openMenu();
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    fireEvent.mouseEnter(edit, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(edit, { clientX: 120, clientY: 30 });

    // A moving centre would restart the 340ms spread on every move.
    expect(inkBrushes()[0]).toMatchObject({ on: true, cx: 10, cy: 10 });
  });

  it('moves the ink to the next row and withdraws it when the pointer leaves, toward where it left that row', async () => {
    await openMenu();
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    const share = screen.getByRole('menuitem', { name: 'Share' });

    fireEvent.mouseEnter(edit, { clientX: 20, clientY: 20 });
    expect(inkBrushes().map((b) => b.on)).toEqual([true, false, false]);

    fireEvent.mouseLeave(edit);
    fireEvent.mouseEnter(share, { clientX: 80, clientY: 60 });
    expect(inkBrushes().map((b) => b.on)).toEqual([false, true, false]);
    // The withdrawing wash shrinks where it spread from: it never jumps to the next row's spot.
    expect(inkBrushes()[0]).toMatchObject({ cx: 20, cy: 20 });

    fireEvent.mouseLeave(share);
    expect(inkBrushes().map((b) => b.on)).toEqual([false, false, false]);
    expect(share).not.toHaveAttribute('data-active');
  });

  it("cuts each row's ink to its band, inside the sheet's own wobble — never a rectangle", async () => {
    await openMenu();
    const layer = document.querySelector<HTMLElement>('[data-row-brushes]')!;
    expect(layer.style.clipPath).toMatch(/^path\('M /);
    const bands = inkBrushes().map((b) => b.band);
    expect(new Set(bands).size).toBe(3);
    for (const band of bands) expect(band).toMatch(/^path\('M .* C .* Z'\)$/);
  });

  it('keeps the destructive row yellow at rest and inks it a deeper yellow', async () => {
    await openMenu();
    // The resting warning wash is drawn under the ink, before any hover…
    const rest = document.querySelector('[data-row-brushes] [data-rest] path')!;
    expect(rest.getAttribute('fill')).toContain('yellow) 25%');
    expect(rest.closest('[data-rest]')).toHaveAttribute('data-rest', '2');

    // …and each row keeps its own ink colour: ordinary rows the menu accent,
    // the delete row a stronger yellow.
    const fills = inkBrushes().map((b) => b.color);
    expect(fills[0]).toContain('--menu-border-hover) 15%');
    expect(fills[1]).toContain('--menu-border-hover) 15%');
    expect(fills[2]).toContain('yellow) 45%');

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Delete' }), {
      clientX: 100,
      clientY: 100,
    });
    expect(inkBrushes().map((b) => b.on)).toEqual([false, false, true]);
    expect(rest.isConnected).toBe(true);
  });

  it('still chooses the row that was inked', async () => {
    const onChoose = await openMenu();
    const share = screen.getByRole('menuitem', { name: 'Share' });
    fireEvent.mouseEnter(share, { clientX: 20, clientY: 60 });
    await userEvent.click(share);
    expect(onChoose).toHaveBeenCalledWith('share');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

// Round 17 §1: every menu is the one sheet — paper and grain, no pen line round it and no lines between its rows,
// lifted by a soft shadow that follows its wobble; rows 44 tall, their content 20 in from either side.
describe('the menu sheet', () => {
  it('draws paper and grain with no pen line and no dividers', async () => {
    const layout = stubRowLayout({ width: 200, rowHeight: 44 });
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Manage" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage' }));
    const panel = screen.getByRole('menu').parentElement!;
    // The paper's fill and its grain, nothing stroked anywhere in it.
    expect(panel.querySelector('path[fill="var(--sheet-paper)"]')).not.toBeNull();
    expect(panel.querySelector('path[stroke]')).toBeNull();
    expect(panel.querySelectorAll('filter feTurbulence')).toHaveLength(1);
    layout.restore();
  });

  it('casts the sheet shadow, which follows the wobble, deeper at night', () => {
    expect(css('src/components/atoms/PaperSheet/PaperSheet.module.css')).toMatch(/\.sheet\s*\{[^}]*filter: var\(--sheet-shadow\)/);
    const tokens = css('src/styles/tokens.css');
    expect(tokens).toMatch(/--sheet-shadow:\s*drop-shadow\(0 8px 24px [^;]*\)\s*drop-shadow\(0 1px 3px [^;]*\);/);
    expect(tokens.match(/--sheet-shadow: drop-shadow\(0 10px 28px color-mix\(in oklch, var\(--shadow-ink\) 45%, transparent\)\);/g)).toHaveLength(2);
  });

  it('sets its rows 44 tall, 20 in from either side, the glyph 12 before the words, the time at the end', () => {
    const menu = css('src/components/molecules/OrganicMenu/OrganicMenu.module.css');
    expect(menu).toMatch(/\.option \{[^}]*gap: 12px;[^}]*height: 44px;[^}]*padding: 0 20px;/);
    expect(menu).toMatch(/\.footer \{[^}]*justify-content: flex-end;[^}]*height: 24px;/);
  });

  it('turns the spread off for people who prefer reduced motion', () => {
    // jsdom cannot evaluate media queries, so pin the stylesheet contract (the rows' brushes).
    expect(css('src/components/atoms/RowInk/RowInk.module.css')).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sheetInk \[data-brush-wash\] > div\s*\{\s*transition:\s*none/,
    );
  });
});

describe('bare trigger', () => {
  it('names itself by what it holds and shows that as its tooltip', async () => {
    const { container } = render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Report or block" bare />);
    const trigger = screen.getByRole('button', { name: 'Report or block' });
    // The tooltip repeats the accessible name, so assistive tech hears it once.
    const tip = trigger.nextElementSibling as HTMLElement;
    expect(tip).toHaveTextContent('Report or block');
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    // No paper chip under the glyph — only the hover disc.
    expect(container.querySelectorAll('button > svg')).toHaveLength(1);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('puts its tooltip away on Escape until focus or the pointer leaves', async () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Report or block" bare />);
    const trigger = screen.getByRole('button', { name: 'Report or block' });
    const tip = trigger.nextElementSibling as HTMLElement;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(tip).toHaveAttribute('data-dismissed');
    fireEvent.blur(trigger);
    expect(tip).not.toHaveAttribute('data-dismissed');
  });

  // A thread's header: the「⋯」closes the row the back arrow opens, in the same ink, at the top of the screen.
  it('can wear full ink at rest and hang its tooltip under it', () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Conversation options" bare tone="ink" tip="below" />);
    const trigger = screen.getByRole('button', { name: 'Conversation options' });
    expect(trigger).toHaveAttribute('data-tone', 'ink');
    expect(trigger.nextElementSibling).toHaveAttribute('data-side', 'below');
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/OrganicMenu/OrganicMenu.module.css'), 'utf8');
    expect(css).toMatch(/\.bare\[data-tone='ink'\]\s*\{\s*color: var\(--color-text\)/);
    expect(css).toMatch(/\.tip\[data-side='below'\]\s*\{\s*top: calc\(100% \+ 6px\)/);
  });

  it('is muted at rest with its tooltip over it unless asked otherwise', () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="More" bare />);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('data-tone', 'muted');
    expect(trigger.nextElementSibling).toHaveAttribute('data-side', 'above');
  });

  it('keeps the chip and no tooltip by default', () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Manage" />);
    expect(screen.getByRole('button', { name: 'Manage' }).nextElementSibling).toBeNull();
  });
});

describe('from the keyboard', () => {
  // A floating panel lies at the end of the page, out of the trigger's tab order: it takes the focus itself.
  it('puts the focus on the first row of a floating panel, walks the rows with the arrows, and comes back on Escape', async () => {
    const onChoose = vi.fn();
    render(<OrganicMenu items={ITEMS} onChoose={onChoose} label="More" bare floating />);
    const trigger = screen.getByRole('button', { name: 'More' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const rows = screen.getAllByRole('menuitem');
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    // The keyboard's row wears the row ink, as the pointer's does.
    expect(rows[1]).toHaveAttribute('data-active');
    expect(rows[0]).not.toHaveAttribute('data-active');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(rows[2]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes a floating panel as Tab leaves its last row, back on the trigger, and chooses with Enter', async () => {
    const onChoose = vi.fn();
    render(<OrganicMenu items={ITEMS} onChoose={onChoose} label="More" bare floating />);
    const trigger = screen.getByRole('button', { name: 'More' });
    trigger.focus();
    await userEvent.keyboard('{Enter}{End}');
    await userEvent.tab();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(trigger).toHaveFocus();

    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(onChoose).toHaveBeenCalledWith('share');
    expect(trigger).toHaveFocus();
  });

  it('leaves the focus on the trigger when a pointer opens a menu hanging under it', async () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Manage" />);
    const trigger = screen.getByRole('button', { name: 'Manage' });
    await userEvent.click(trigger);
    expect(trigger).toHaveFocus();
  });
});

describe('floating panel', () => {
  // A trigger inside something that scrolls (a message in a thread): the panel floats over the page instead.
  function triggerAt(rect: Partial<DOMRect>) {
    const trigger = screen.getByRole('button', { name: 'More' });
    trigger.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 36, height: 36, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect;
    return trigger;
  }

  it('hangs under the trigger, outside its box, with a quiet footer line under the rows', async () => {
    const onChoose = vi.fn();
    const { container } = render(
      <OrganicMenu items={ITEMS} onChoose={onChoose} label="More" bare floating align="start" footer="March 1, 10:00 AM" />,
    );
    await userEvent.click(triggerAt({ top: 100, bottom: 136, left: 300, right: 336 }));

    const panel = screen.getByRole('menu').closest('[style*="top"]') as HTMLElement;
    expect(container.contains(panel)).toBe(false);
    expect(panel.style.top).toBe('144px');
    expect(panel.style.left).toBe('300px');
    expect(screen.getByText('March 1, 10:00 AM')).toBeInTheDocument();
    // 6 of paper, three rows of 44, the footer's 24 line directly under them, 10 of paper (round 17 §2.3).
    expect(screen.getByRole('menu').parentElement).toHaveStyle({ height: `${6 + 3 * 44 + 24 + 10}px` });

    // A click inside the floating panel is a choice, not an outside click.
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(onChoose).toHaveBeenCalledWith('share');
  });

  it('opens over the trigger when there is no room under it, and goes away when the page scrolls', async () => {
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="More" bare floating />);
    await userEvent.click(triggerAt({ top: window.innerHeight - 40, bottom: window.innerHeight - 4, left: 300, right: 336 }));
    const panel = screen.getByRole('menu').closest('[style*="bottom"]') as HTMLElement;
    expect(panel.style.bottom).toBe('48px');
    expect(panel.style.right).toBe(`${window.innerWidth - 336}px`);

    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('rows that say more than an icon and a word (the share menu)', () => {
  it('draws an element as it is in the icon slot, and names a row by its own label when it has one', async () => {
    const items: OrganicMenuItem[] = [
      { key: 'copy', icon: 'copy', label: 'Copy link' },
      { key: 'line', icon: <svg data-testid="brand-line" aria-hidden="true" />, label: 'LINE', ariaLabel: 'Share on LINE' },
    ];
    const onChoose = vi.fn();
    render(<OrganicMenu items={items} onChoose={onChoose} label="Share" bare triggerIcon="share" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    const line = screen.getByRole('menuitem', { name: 'Share on LINE' });
    expect(line).toHaveTextContent('LINE');
    expect(line).toContainElement(screen.getByTestId('brand-line'));
    // A row without its own label is named by its words.
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).not.toHaveAttribute('aria-label');
    await userEvent.click(line);
    expect(onChoose).toHaveBeenCalledWith('line');
  });

  it('lets the host answer the click itself: the panel stays closed when it says so', async () => {
    const handled = vi.fn(() => true);
    const { rerender } = render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Share" bare triggerIcon="share" onTriggerClick={handled} />);
    const trigger = screen.getByRole('button', { name: 'Share' });
    await userEvent.click(trigger);
    expect(handled).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Not handled: the menu opens as ever — and closing it again asks nothing.
    const notHandled = vi.fn(() => false);
    rerender(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Share" bare triggerIcon="share" onTriggerClick={notHandled} />);
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(notHandled).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // The rule meant for the ⋯'s dots filled every bare glyph: the share tray came out a solid blob.
  it('fills the dots of a bare ⋯ only, never another bare glyph', () => {
    render(
      <>
        <OrganicMenu items={ITEMS} onChoose={vi.fn()} label="More" bare />
        <OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Share" bare triggerIcon="share" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('data-icon', 'dots');
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('data-icon', 'share');
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/OrganicMenu/OrganicMenu.module.css'), 'utf8');
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const fills = [...rules.matchAll(/([^{}]+)\{[^}]*fill:\s*currentColor/g)].map((m) => m[1].trim());
    expect(fills).toEqual([".bare[data-icon='dots'] .triggerIcon path"]);
  });

  it('lets a hint under the rows wrap, the panel as tall as its lines', async () => {
    const layout = stubRowLayout({ width: 220, rowHeight: 44 });
    const footerHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.textContent === 'A hint long enough to take two lines') return 52;
      return this.querySelectorAll('[role="menuitem"]').length * 44;
    });
    render(<OrganicMenu items={ITEMS} onChoose={vi.fn()} label="Share" bare footer="A hint long enough to take two lines" footerWrap />);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('menu').parentElement).toHaveStyle({ height: `${6 + 3 * 44 + 52 + 10}px` });
    footerHeight.mockRestore();
    layout.restore();
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/OrganicMenu/OrganicMenu.module.css'), 'utf8');
    expect(css).toMatch(/\.footerWrap\s*\{[^}]*max-width: min\(256px, calc\(100vw - 96px\)\);[^}]*white-space: normal/);
  });
});
