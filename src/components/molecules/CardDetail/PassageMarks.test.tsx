// @vitest-environment jsdom
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, renderWithIntl } from '@/../test/render';
import type { AuthorBody, TapPickedBody } from '@/lib/api/v1/schemas';
import { PassageMarks } from './PassageMarks';
import { PASSAGE_WASH_OUT } from './PassageFaces';

// Round 29 §U2: a picked sentence inside a table that scrolls sideways (`.story-table`, overflow-x: auto). Its wash is
// cut to the table's box — client rects ignore the table's clip — and follows the words when the table scrolls.

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
