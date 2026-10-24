// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { headingBeingRead, tocHeadings } from './CardToc';

const tops = (...ys: number[]) => ys.map((top, i) => ({ id: `h${i + 1}`, top }));

describe('headingBeingRead', () => {
  it('is none until the first heading passes the reading line', () => {
    expect(headingBeingRead(tops(300, 900, 1500), 178, false, 800)).toBeNull();
  });

  it('is the last heading above the reading line', () => {
    expect(headingBeingRead(tops(-400, 120, 700), 178, false, 800)).toBe('h2');
    expect(headingBeingRead(tops(-900, -300, 178), 178, false, 800)).toBe('h3');
  });

  it('at the end of the page, is the last heading on screen (the closing sections never reach the line)', () => {
    expect(headingBeingRead(tops(-600, 100, 500, 760), 178, true, 800)).toBe('h4');
    expect(headingBeingRead(tops(-600, 100, 500, 900), 178, true, 800)).toBe('h3');
  });
});

describe('tocHeadings', () => {
  it('takes every heading h2–h6 with an anchor, h2 at the first level and the rest at the second', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<h2 id="a">出發</h2><p>…</p><h3 id="b">0 公尺</h3><h4 id="c">補給站</h4><h6 id="d">終點</h6><h5>no anchor</h5><h2 id="e">回家</h2>';
    expect(tocHeadings(root)).toEqual([
      { id: 'a', text: '出發', level: 2 },
      { id: 'b', text: '0 公尺', level: 3 },
      { id: 'c', text: '補給站', level: 3 },
      { id: 'd', text: '終點', level: 3 },
      { id: 'e', text: '回家', level: 2 },
    ]);
  });
});

describe('storyHasContents', () => {
  it('is whether the story has a heading of its own — never one in a code fence', async () => {
    const { storyHasContents } = await import('./CardToc');
    expect(storyHasContents('## 那年夏天\n\n內文')).toBe(true);
    expect(storyHasContents('前言\n\n   ### 小標\n')).toBe(true);
    expect(storyHasContents('沒有標題的故事')).toBe(false);
    expect(storyHasContents('#標籤 不是標題')).toBe(false);
    expect(storyHasContents('```\n## 不是標題\n```\n內文')).toBe(false);
  });
});
