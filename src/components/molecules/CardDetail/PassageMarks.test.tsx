// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, renderWithIntl } from '@/../test/render';
import type { AuthorBody, TapPickedBody } from '@/lib/api/v1/schemas';
import { PassageMarks } from './PassageMarks';
import { PASSAGE_WASH_OUT } from './PassageFaces';

// Round 29 §U2: a picked sentence inside a table that scrolls sideways (`.story-table`, overflow-x: auto). Its wash is
// cut to the table's box — client rects ignore the table's clip — and follows the words when the table scrolls.
// §S10: on a wide window the faces stand in the LEFT margin, beside the line where the sentence's wash begins.

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const picked: TapPickedBody[] = [{ id: 'p1', text: '我坐在地上。', people: [face('gus')], more: false }];

const rect = (left: number, right: number, top = 10, bottom = 34) =>
  ({ left, right, top, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect;

function Story({ marks }: { marks: readonly TapPickedBody[] | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-story="">
      <PassageMarks cardId="c" picked={marks} script="cjk" storyRef={ref}>
        <div className="story-table">
          <table>
            <tbody>
              <tr>
                <td>
                  <mark className="story-passage" data-passage="p1" style={{ lineHeight: '24px' }}>
                    我坐在地上。
                  </mark>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PassageMarks>
    </div>
  );
}

describe('a picked sentence in a table that scrolls sideways', () => {
  it('is washed only inside the table, and the wash follows the words when the table scrolls', () => {
    let markRects = [rect(400, 480)];
    const table = { box: rect(0, 300, 0, 60) };
    const originalRects = Element.prototype.getClientRects;
    const originalBox = Element.prototype.getBoundingClientRect;
    Element.prototype.getClientRects = function (this: Element) {
      return (this.tagName === 'MARK' ? markRects : []) as unknown as DOMRectList;
    };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.classList.contains('story-table') ? table.box : rect(0, 0, 0, 0);
    };
    try {
      // The picked sentences arrive with the card's answer, after the story is on the page.
      const { container, rerender } = renderWithIntl(<Story marks={undefined} />);
      rerender(<Story marks={picked} />);
      const washes = () => [...container.querySelectorAll<HTMLElement>('[data-passage-washes] span')];
      // Past the table's right edge: nothing drawn in the margin.
      expect(washes()).toHaveLength(0);

      // Scrolled so the sentence straddles the right edge: the wash stops at the table's box.
      markRects = [rect(260, 340)];
      fireEvent.scroll(container.querySelector('.story-table')!);
      expect(washes()).toHaveLength(1);
      expect(parseFloat(washes()[0].style.left)).toBe(260 - PASSAGE_WASH_OUT);
      expect(parseFloat(washes()[0].style.left) + parseFloat(washes()[0].style.width)).toBe(300 + PASSAGE_WASH_OUT);

      // Scrolled further: the wash moves with the words.
      markRects = [rect(120, 200)];
      fireEvent.scroll(container.querySelector('.story-table')!);
      expect(parseFloat(washes()[0].style.left)).toBe(120 - PASSAGE_WASH_OUT);
      expect(parseFloat(washes()[0].style.width)).toBe(80 + 2 * PASSAGE_WASH_OUT);
    } finally {
      Element.prototype.getClientRects = originalRects;
      Element.prototype.getBoundingClientRect = originalBox;
    }
  });
});

function Prose({ marks }: { marks: readonly TapPickedBody[] | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-story="">
      <PassageMarks cardId="c" picked={marks} script="cjk" storyRef={ref}>
        <p>
          箱子堆滿了客廳，
          <mark className="story-passage" data-passage="p1" style={{ lineHeight: '24px' }}>
            我坐在地上。
          </mark>
        </p>
      </PassageMarks>
    </div>
  );
}

describe('the faces on a wide window (§S10, the owner, 2026-11-22: the left after all)', () => {
  const marginCss = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/PassageMarks.module.css'), 'utf8');
  const facesCss = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/PassageFaces.module.css'), 'utf8');

  it('stand in the left margin, by the white left of the column, beside the line where the wash begins', () => {
    // A 680 column at 300 in a 1000 window: 300 white on the left, 20 on the right (a contents rail would not count).
    const story = rect(300, 980, 0, 2000);
    // The sentence runs over two lines: it begins at the end of the first (centre 22), ends on the second (centre 56).
    const markRects = [rect(600, 980, 10, 34), rect(300, 400, 44, 68)];
    const originalRects = Element.prototype.getClientRects;
    const originalBox = Element.prototype.getBoundingClientRect;
    Element.prototype.getClientRects = function (this: Element) {
      return (this.tagName === 'MARK' ? markRects : [story]) as unknown as DOMRectList;
    };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.hasAttribute('data-story') ? story : rect(0, 0, 0, 0);
    };
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    try {
      // The picked sentences arrive with the card's answer, after the story is on the page.
      const { container, rerender } = renderWithIntl(<Prose marks={undefined} />);
      rerender(<Prose marks={picked} />);
      const margin = container.querySelector<HTMLElement>('[data-passage-margin]');
      expect(margin).not.toBeNull();
      const faces = margin!.querySelector<HTMLElement>('[data-passage-faces="p1"]')!;
      expect(faces).toHaveAttribute('data-placement', 'margin');
      // Not in the line: no slot after the sentence.
      expect(container.querySelector('.story-passage-glue')).toBeNull();
      // Centred on the wash's first line (22), the face 24: its box from 10.
      expect(parseFloat(faces.style.top)).toBe(22 - 12);
      // The margin's right edge 8 left of the column's left edge; the group on its right edge.
      expect(marginCss).toMatch(/\.margin \{[^}]*right: calc\(100% \+ 8px\);/);
      expect(marginCss).not.toMatch(/\.margin \{[^}]*left: calc/);
      expect(facesCss).toMatch(/\.group\[data-placement='margin'\] \{[^}]*right: 0;/);
    } finally {
      Element.prototype.getClientRects = originalRects;
      Element.prototype.getBoundingClientRect = originalBox;
    }
  });

  it('stand in the line when the white left of the column is under 70, whatever is on the right', () => {
    const story = rect(20, 370, 0, 2000);
    const originalRects = Element.prototype.getClientRects;
    const originalBox = Element.prototype.getBoundingClientRect;
    Element.prototype.getClientRects = function (this: Element) {
      return (this.tagName === 'MARK' ? [rect(40, 200, 10, 34)] : [story]) as unknown as DOMRectList;
    };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.hasAttribute('data-story') ? story : rect(0, 0, 0, 0);
    };
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    try {
      const { container, rerender } = renderWithIntl(<Prose marks={undefined} />);
      rerender(<Prose marks={picked} />);
      expect(container.querySelector('[data-passage-washes]')).not.toBeNull();
      expect(container.querySelector('[data-passage-margin]')).toBeNull();
    } finally {
      Element.prototype.getClientRects = originalRects;
      Element.prototype.getBoundingClientRect = originalBox;
    }
  });
});
