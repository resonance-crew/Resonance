import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Where the stage stands (film.module.css). The world is laid out on the small viewport; when a phone's browser hides
 * its address bar the height it gives back must open over the stage as sky — never under the ground, where nothing is
 * drawn for it (the owner, 2026-11-12). That holds only while the stage is the small viewport's height and is held by
 * its foot; a stage pinned by its top at the large viewport's height uncovers a strip under the world instead.
 */
const css = readFileSync(join(__dirname, 'film.module.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
const decl = (body: string, prop: string) => new RegExp(`(?:^|\\n)\\s*${prop}:\\s*([^;]+);`).exec(body)?.[1].trim();

describe('the film’s stage on a phone whose address bar hides', () => {
  it('is the small viewport’s height, held by its foot at the end of its track', () => {
    const stage = rule(".film[data-film='film'] .stage");
    expect(decl(stage, 'position')).toBe('sticky');
    expect(decl(stage, 'bottom')).toBe('0');
    expect(decl(stage, 'top')).toBeUndefined();
    expect(decl(stage, 'height')).toBe('100svh');
    const track = rule(".film[data-film='film']");
    expect(decl(track, 'display')).toBe('flex');
    expect(decl(track, 'justify-content')).toBe('flex-end');
  });

  it('paints the room the bar gives back, over the stage: its clip, the sky, the stars and the grain run up by --bar', () => {
    expect(decl(rule('.page'), '--bar')).toBe('calc(100lvh - 100svh)');
    const stage = rule(".film[data-film='film'] .stage");
    expect(decl(stage, 'clip-path')).toBe('inset(calc(-1 * var(--bar)) 0 0 0)');
    // (paint containment would cut the stage at its own box again)
    expect(decl(stage, 'contain')).not.toMatch(/strict|paint|content/);
    expect(decl(stage, 'overflow')).toBe('visible');
    expect(decl(rule('.sky'), 'inset')).toBe('calc(-1 * var(--bar)) 0 0 0');
    expect(decl(rule('.stars'), 'top')).toBe('calc(-1 * var(--bar))');
    expect(decl(rule('.grain'), 'inset')).toBe('calc(-1 * var(--bar)) 0 0 0');
  });
});

/**
 * The end's arrow (the owner, 2026-11-23: 「看到最後不會出現那個往下滑的箭頭提醒」). ▶ plays on through the night's
 * hold to the track's very end, where the stage lets go and the player sinks away: the arrow, which lives in the
 * player, went with it a few seconds after it came. It stays there now, and leaves only once the visitor goes on.
 */
describe('the arrow on to the stories, once the film is over', () => {
  it('stays where ▶ left the page, the stage let go, until the visitor scrolls on', () => {
    const sinks = rule(".film[data-film='film'][data-released] .lip");
    expect(decl(sinks, 'opacity')).toBe('0');
    const stays = rule(".film[data-film='film'][data-released]:not([data-onward]) .lip[data-ended]");
    expect(decl(stays, 'opacity')).toBe('1');
    expect(decl(stays, 'transform')).toBe('none');
    // the arrow itself shows whenever the film is over
    expect(decl(rule('.lip[data-ended] .lipNext'), 'opacity')).toBe('1');
  });

  it('is let go a little past the track’s end, where ▶ rests (runtime/index.ts)', async () => {
    const src = readFileSync(join(__dirname, 'runtime/index.ts'), 'utf8');
    expect(src).toMatch(/const on = yS >= TRACK_SVH \+ ONWARD_SVH;/);
    expect(src).toContain("root.toggleAttribute('data-onward', on)");
    expect(src).toContain("root.removeAttribute('data-onward')");
    const { ONWARD_SVH } = await import('./runtime/index');
    // ▶ rests within half a svh of the end (the release's own margin): the arrow must still be there
    expect(ONWARD_SVH).toBeGreaterThan(0);
    expect(ONWARD_SVH).toBeLessThan(0.5);
  });
});
