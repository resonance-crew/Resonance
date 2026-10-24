import { INK_LIGHT } from './strokes';
import { wavyLine } from './wavyPath';

/**
 * A story's table drawn with the pen (round 9 §6): the rule under the header
 * row and the hairlines between rows are hand-drawn lines with a small wobble
 * — still rules the eye runs along, never a curve that pulls it off its row.
 *
 * - The header's rule: ±1.0, the light pen (INK_LIGHT), the muted ink at 60 %,
 *   overshooting the table by {@link TABLE_RULES}.head.overshoot at each end —
 *   a hand drawing a line under a header runs past it a little.
 * - A rule between rows: ±0.7, a hairline (1 — the straight rule's own width,
 *   the quietest mark a story makes, below the pen's weights), the muted ink
 *   at 30 %, stopping {@link TABLE_RULES}.row.inset short of each end.
 * - One turn per ~90 px (at least 3), seeded per table × row, so a story draws
 *   the same table the same way on every visit. Never past ±{@link TABLE_RULES}.maxAmp.
 *
 * The apps draw the same recipe with their own wavy-line helpers.
 */
export const TABLE_RULES = {
  head: { amp: 1.0, stroke: INK_LIGHT, ink: 60, overshoot: 1.5 },
  row: { amp: 0.7, stroke: 1, ink: 30, inset: 2 },
  /** The px a turn takes, and the fewest turns a rule has. */
  turnEvery: 90,
  minTurns: 3,
  maxAmp: 1.2,
} as const;

/** How many turns a table's rule takes across `width` px: one per ~90, 3 at the fewest. */
export function tableRuleTurns(width: number): number {
  if (!(width > 0)) return TABLE_RULES.minTurns;
  return Math.max(TABLE_RULES.minTurns, Math.round(width / TABLE_RULES.turnEvery));
}

/** The seed of one rule: its table's (where the table sits in its story's source) × its row. */
export function tableRuleSeed(tableSeed: number, row: number): number {
  return (Math.abs(Math.round(tableSeed)) % 9973) * 31 + row * 7 + 1;
}

export interface TableRule {
  kind: 'head' | 'row';
  /** Where the rule starts, from the table's start edge (negative: before it). */
  x: number;
  /** The row boundary it sits on, from the table's top. */
  y: number;
  /** Its length. */
  width: number;
  /** The path from (0,0) to (width,0), wobbling ±amp. */
  d: string;
  stroke: number;
}

/**
 * The rules a table of `width` draws: one under the header row (`headBottom`,
 * null when it has none) and one on each boundary between body rows
 * (`rowTops`: the top of every body row after the first), all from the
 * table's top-left.
 */
export function tableRules(width: number, headBottom: number | null, rowTops: number[], tableSeed: number): TableRule[] {
  if (!(width > 0)) return [];
  const out: TableRule[] = [];
  const { head, row } = TABLE_RULES;
  const amp = (a: number) => Math.min(a, TABLE_RULES.maxAmp);
  if (headBottom !== null) {
    const w = width + head.overshoot * 2;
    out.push({
      kind: 'head',
      x: -head.overshoot,
      y: headBottom,
      width: w,
      d: wavyLine(w, tableRuleSeed(tableSeed, 0), amp(head.amp), tableRuleTurns(w)),
      stroke: head.stroke,
    });
  }
  const w = width - row.inset * 2;
  if (w > 0) {
    rowTops.forEach((y, i) => {
      out.push({
        kind: 'row',
        x: row.inset,
        y,
        width: w,
        d: wavyLine(w, tableRuleSeed(tableSeed, i + 1), amp(row.amp), tableRuleTurns(w)),
        stroke: row.stroke,
      });
    });
  }
  return out;
}
