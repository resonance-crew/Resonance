// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { WATCH_STILLS_SCRIPT, watchStills } from './whole';

const still = (n: number, slug = 'dot') => {
  const pal = document.createElement('span');
  pal.dataset.pal = slug;
  for (let i = 0; i < n; i++) {
    const im = document.createElement('img');
    im.setAttribute('src', `/mascots/${slug}/${i}.webp`);
    pal.append(im);
  }
  return pal;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a still shows whole or not at all', () => {
  it('is marked whole once every part it draws is in, and never before', async () => {
    const root = document.createElement('div');
    const a = still(3);
    const b = still(2, 'tuck');
    root.append(a, b);
    watchStills(root);
    const [p0, p1, p2] = a.querySelectorAll('img');
    p0.dispatchEvent(new Event('load'));
    p1.dispatchEvent(new Event('load'));
    await tick();
    expect(a.hasAttribute('data-whole')).toBe(false);
    p2.dispatchEvent(new Event('load'));
    await tick();
    expect(a.hasAttribute('data-whole')).toBe(true);
    // a part that fails keeps the still unseen
    const [q0, q1] = b.querySelectorAll('img');
    q0.dispatchEvent(new Event('load'));
    q1.dispatchEvent(new Event('error'));
    await tick();
    expect(b.hasAttribute('data-whole')).toBe(false);
  });

  it('watches each still once, however often it is asked, and ships as a self-contained inline script', async () => {
    const root = document.createElement('div');
    const a = still(1);
    root.append(a);
    watchStills(root);
    watchStills(root);
    a.querySelector('img')!.dispatchEvent(new Event('load'));
    await tick();
    expect(a.hasAttribute('data-whole')).toBe(true);
    expect(WATCH_STILLS_SCRIPT).toMatch(/^\(function\(\)\{try\{\(function watchStills\(scope\)/);
    expect(() => new Function(WATCH_STILLS_SCRIPT)).not.toThrow();
  });
});
