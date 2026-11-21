/**
 * What stands over the stage in the page's own px keeps to the header's margin on a window wider than the header's
 * column (the owner, 2026-11-21, at about 1600 px: the logo and the player kept to their columns and the hero's words
 * stood 80 px out to their left; at 1920 the night's small cards 264 px). The header's row, the hero, the opening
 * still's card and the night's sky cards (script/marks `columnEdge`) say the same column — a CSS file can't share a
 * length with a script, so this holds the four together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { columnEdge } from './script/marks';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');
/** The declarations of the rule whose selector is exactly `selector` — inside the at-rule `within`, when given. */
function rule(css: string, selector: string, within?: string): string {
  if (!within) {
    const i = css.indexOf(`\n${selector} {`);
    expect(i, selector).toBeGreaterThanOrEqual(0);
    return css.slice(i, css.indexOf('}', i));
  }
  // an at-rule's block ends at the first `}` in the first column
  for (let at = css.indexOf(within); at >= 0; at = css.indexOf(within, at + 1)) {
    const block = css.slice(at, css.indexOf('\n}', at));
    const i = block.indexOf(`\n  ${selector} {`);
    if (i >= 0) return block.slice(i, block.indexOf('}', i));
  }
  throw new Error(`no ${selector} in ${within}`);
}

const COLUMN = 'calc((100% - 1200px) / 2)';

describe('the landing film keeps to the header\'s column', () => {
  const film = read('film.module.css');
  const header = read('FilmHeader.module.css');

  it('the header\'s row is 1200 px, centred, with 5 % of the window as its least margin', () => {
    const row = rule(header, '.row');
    expect(row).toContain(`padding-left: max(clamp(24px, 5vw, 80px), ${COLUMN});`);
    expect(row).toContain(`padding-right: max(clamp(24px, 5vw, 80px), ${COLUMN});`);
  });

  it('the hero starts on the logo\'s line once the window is wider than that column', () => {
    expect(rule(film, '.hero', '@media (min-aspect-ratio: 11/10) {')).toContain(`left: max(40px, 7.8vw, ${COLUMN});`);
    // a tall window (a tablet upright, a tall desktop one): both sides
    expect(rule(film, '.film')).toContain(`--film-col-x: max(clamp(24px, 5vw, 80px), ${COLUMN});`);
    const tall = rule(film, '.hero', '@media (min-width: 640px) and (max-aspect-ratio: 11/10) {');
    expect(tall).toContain('left: max(40px, var(--film-col-x));');
    expect(tall).toContain('right: max(40px, var(--film-col-x));');
  });

  it('the opening still\'s card ends on the header\'s last button', () => {
    expect(rule(film, ".film:not([data-film='film']) .slot[data-slot='story']")).toContain(`right: max(40px, 6vw, ${COLUMN});`);
  });

  it('the script\'s margin is the header\'s at every wide width', () => {
    // max(clamp(24, 5vw, 80), (w − 1200) / 2), from the narrowest wide window up
    for (const w of [700, 1024, 1180, 1280, 1333, 1366, 1440, 1611, 1920, 2560, 3840]) {
      const css = Math.max(Math.min(80, Math.max(24, 0.05 * w)), (w - 1200) / 2);
      expect(columnEdge(w), `${w}`).toBeCloseTo(css, 6);
    }
  });
});
