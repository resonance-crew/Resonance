// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import { TABLE_RULES, tableRuleTurns, tableRules } from '@/lib/design/tableRules';
import { StoryMarkdown } from './StoryMarkdown';

vi.mock('@/components/molecules/EmbedStoryCard/CardEmbedLink', () => ({
  CardEmbedLink: () => null,
}));

/**
 * jsdom lays nothing out: give the scroller, the table and its rows a layout —
 * the table 400 wide at the box's padding (2), each row 40 tall.
 */
const TABLE_W = 400;
const ROW_H = 40;
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}
let laidOut = true;
const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  laidOut = true;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (!laidOut) return rect(0, 0, 0, 0);
    if (this instanceof HTMLTableRowElement) return rect(2, this.rowIndex * ROW_H, TABLE_W, ROW_H);
    if (this instanceof HTMLTableElement) return rect(2, 0, TABLE_W, this.rows.length * ROW_H);
    if (this.classList.contains('story-table')) return rect(0, 0, 300, 200);
    return rect(0, 0, 0, 0);
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
});

const TABLE = '| 日子 | 做了什麼 |\n|:--|--:|\n| 週一 | 打包 |\n| 週二 | 拆床 |\n| 週三 | 搬家 |';
const heads = (container: HTMLElement) => [...container.querySelectorAll('.story-table-rules path[data-kind="head"]')];
const rows = (container: HTMLElement) => [...container.querySelectorAll('.story-table-rules path[data-kind="row"]')];

describe('StoryTable — the pen rules (round 9 §6)', () => {
  it('draws the header rule and one between each pair of body rows over the measured table', () => {
    const { container } = renderWithIntl(<StoryMarkdown source={TABLE} />);
    const box = screen.getByRole('region', { name: 'Table' });
    // Drawn: the straight CSS rules hand over (story.css clears them under data-ruled).
    expect(box).toHaveAttribute('data-ruled');
    const svg = box.querySelector('svg.story-table-rules')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', String(TABLE_W));
    // Laid over the table where it sits in the scroller (its 2px of room for the overshoot).
    expect((svg as SVGElement).style.left).toBe('2px');

    const [head] = heads(container);
    expect(heads(container)).toHaveLength(1);
    // Under the header row, overshooting the table at both ends, the light pen.
    expect(head.getAttribute('transform')).toBe(`translate(${-TABLE_RULES.head.overshoot} ${ROW_H})`);
    expect(head.getAttribute('stroke-width')).toBe(String(TABLE_RULES.head.stroke));
    // Three body rows: two boundaries, each stopping short of both ends, the hairline.
    const between = rows(container);
    expect(between.map((p) => p.getAttribute('transform'))).toEqual([
      `translate(${TABLE_RULES.row.inset} ${2 * ROW_H})`,
      `translate(${TABLE_RULES.row.inset} ${3 * ROW_H})`,
    ]);
    expect(between.every((p) => p.getAttribute('stroke-width') === '1')).toBe(true);
    // Each its own line: seeded per row.
    expect(between[0].getAttribute('d')).not.toBe(between[1].getAttribute('d'));
  });

  it("draws a story's tables the same way every time, and its two tables differently", () => {
    const story = `前言\n\n${TABLE}\n\n中間\n\n${TABLE}`;
    const first = renderWithIntl(<StoryMarkdown source={story} />);
    const once = heads(first.container).map((p) => p.getAttribute('d'));
    first.unmount();
    const again = renderWithIntl(<StoryMarkdown source={story} />);
    expect(heads(again.container).map((p) => p.getAttribute('d'))).toEqual(once);
    expect(once).toHaveLength(2);
    expect(once[0]).not.toBe(once[1]);
  });

  it('leaves the straight rules standing until the table is laid out', () => {
    laidOut = false;
    const { container } = renderWithIntl(<StoryMarkdown source={TABLE} />);
    expect(screen.getByRole('region', { name: 'Table' })).not.toHaveAttribute('data-ruled');
    expect(container.querySelector('.story-table-rules')).toBeNull();
  });
});

describe('tableRules', () => {
  it('turns once per ~90px, three at the fewest', () => {
    expect(tableRuleTurns(120)).toBe(3);
    expect(tableRuleTurns(360)).toBe(4);
    expect(tableRuleTurns(900)).toBe(10);
  });

  it('never wobbles past ±1.2, the header ±1.0, the rows ±0.7', () => {
    const ys = (d: string) => [...d.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((m) => Math.abs(Number(m[1])));
    for (let seed = 0; seed < 40; seed++) {
      const [head, ...between] = tableRules(640, 40, [80, 120, 160], seed);
      expect(Math.max(...ys(head.d))).toBeLessThanOrEqual(TABLE_RULES.head.amp);
      for (const r of between) expect(Math.max(...ys(r.d))).toBeLessThanOrEqual(TABLE_RULES.row.amp);
    }
    expect(TABLE_RULES.head.amp).toBeLessThanOrEqual(TABLE_RULES.maxAmp);
  });

  it('spans the table: the header past both ends, the rows short of them', () => {
    const [head, row] = tableRules(300, 40, [80], 7);
    expect(head.x).toBe(-1.5);
    expect(head.width).toBe(303);
    expect(row.x).toBe(2);
    expect(row.width).toBe(296);
    expect(tableRules(300, null, [], 7)).toEqual([]);
  });
});
