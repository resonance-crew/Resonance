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
