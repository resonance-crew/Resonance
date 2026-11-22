// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import zhMessages from '@/messages/zh-TW.json';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { AuthorBody, TapPickedBody } from '@/lib/api/v1/schemas';
import { StoryMarkdown, StoryPassagesContext } from './StoryMarkdown';
import {
  PASSAGE_MARGIN_MIN,
  PassageFaces,
  marginCentres,
  passageFaceSize,
  passageGroupWidth,
  passagePlacement,
  passageRoom,
  washPieces,
} from './PassageFaces';

// Round 29 §S1–§S2: the faces of who picked a sentence of the author's own story — the stack, its size, where it
// stands by the room left of the column (§S10), glued to the sentence's last character in the line, and what it says.

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const picked = (people: string[], more = false): TapPickedBody => ({ id: 'a1b2c3d4', text: '我坐在地上。', people: people.map(face), more });
const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/PassageFaces.module.css'), 'utf8');

function group(p: TapPickedBody, onOpen = vi.fn(), locale: 'en' | 'zh-TW' = 'zh-TW') {
  const page = renderWithIntl(createElement(PassageFaces, { picked: p, size: 24, placement: 'inline' as const, onOpen }), {
    locale,
    ...(locale === 'zh-TW' ? { messages: zhMessages } : {}),
  });
  return { ...page, onOpen };
}

describe('the group', () => {
  it('is the house stack, overlapped: at most three faces and nothing after them — no blank disc, no number', () => {
    const { container } = group(picked(['gus', 'bob', 'carol', 'dora'], true));
    expect([...container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'))).toEqual(['gus', 'bob', 'carol']);
    expect(container.querySelector('[data-more]')).toBeNull();
    expect(container.textContent).not.toMatch(/\d|\+/);
    // Each face steps 0.66 of its size after the one before: 24 / 39.8 / 55.7.
    const stack = container.querySelector('[data-count]') as HTMLElement;
    expect(stack.style.getPropertyValue('--avatar-step')).toBe(`${24 * 0.34}px`);
    expect([1, 2, 3].map((n) => Math.round(passageGroupWidth(n, 24) * 10) / 10)).toEqual([24, 39.8, 55.7]);
  });

  it('is one button, its faces spoken — and that there are others when there are', () => {
    group(picked(['gus', 'bob']));
    expect(screen.getByRole('button', { name: 'gus、bob對這一段有共鳴' })).toHaveAttribute('data-passage-faces', 'a1b2c3d4');
  });

  it('says “and others” when the answer says more', () => {
    group(picked(['gus', 'bob', 'carol'], true), vi.fn(), 'en');
    expect(screen.getByRole('button', { name: 'This part stayed with gus, bob, carol and others' })).toBeInTheDocument();
  });

  it('opens its sentence’s people when pressed', async () => {
    const { onOpen } = group(picked(['gus']));
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('a1b2c3d4');
  });

  it('reaches 44 × 44 round it, with no shadow and no fill of its own', () => {
    expect(css).toMatch(/width: max\(44px, 100%\)/);
    expect(css).toMatch(/height: 44px/);
    expect(css).not.toMatch(/box-shadow|filter:/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});

describe('the size', () => {
  it('is 24; 22 in a Latin story on a compact window; in the margin never so big three would come within 6 of the edge', () => {
    expect(passageFaceSize({ placement: 'inline', script: 'cjk', compact: true, room: 20 })).toBe(24);
    expect(passageFaceSize({ placement: 'inline', script: 'latin', compact: true, room: 20 })).toBe(22);
    expect(passageFaceSize({ placement: 'inline', script: 'latin', compact: false, room: 20 })).toBe(24);
    // 80 on the left: 24 (the cap there is 28.4); three faces end 16 short of the window's edge.
    expect(passageFaceSize({ placement: 'margin', script: 'cjk', compact: false, room: 80 })).toBe(24);
    expect(80 - 8 - passageGroupWidth(3, 24)).toBeCloseTo(16.3, 1);
    // At the threshold, the cap is (70 − 14) ÷ 2.32.
    expect(passageFaceSize({ placement: 'margin', script: 'cjk', compact: false, room: 70 })).toBe(24);
    const small = passageFaceSize({ placement: 'margin', script: 'cjk', compact: false, room: 60 });
    expect(small).toBeCloseTo(46 / 2.32, 5);
    expect(8 + passageGroupWidth(3, small) + 6).toBeCloseTo(60, 5);
  });
});

describe('the place by room', () => {
  it('stands in the left margin when the white left of the column is ≥ 70, in the line everywhere else', () => {
    expect(PASSAGE_MARGIN_MIN).toBe(70);
    // The 820 iPad upright (a 680 column centred, 70 each side) — the margin.
    expect(passagePlacement(passageRoom({ columnLeft: 70 }))).toBe('margin');
    // The desktop at 1280, a 680 column beside a contents rail: the white on the left counts, the rail does not.
    expect(passagePlacement(passageRoom({ columnLeft: 220 }))).toBe('margin');
    // A turned 1024 tablet whose 目錄 pushes the column left: 41 there — the line.
    expect(passagePlacement(passageRoom({ columnLeft: 41 }))).toBe('inline');
    // Something standing left of the page (a side rail) takes its width from the room.
    expect(passageRoom({ columnLeft: 150, leftEdge: 100 })).toBe(50);
    // 768 — the line; a phone's 20 of gutter — the line.
    expect(passagePlacement(passageRoom({ columnLeft: 44 }))).toBe('inline');
    expect(passagePlacement(passageRoom({ columnLeft: 20 }))).toBe('inline');
  });

  it('puts a later group a line box lower when two would share a line', () => {
    expect(marginCentres([{ y: 16, lineBox: 33.3 }, { y: 16, lineBox: 33.3 }, { y: 200, lineBox: 33.3 }])).toEqual([16, 49.3, 200]);
    expect(marginCentres([{ y: 16, lineBox: 33.3 }, { y: 30, lineBox: 33.3 }])).toEqual([16, 49.3]);
  });

  it('lays one wash piece per line: the pieces of a line joined, 2 past each end, the line box less 6 tall, centred', () => {
    const pieces = washPieces([
      { left: 10, top: 3.5, right: 100, bottom: 29.8, lineBox: 33.3 },
      { left: 100, top: 3.5, right: 180, bottom: 29.8, lineBox: 33.3 },
      { left: 0, top: 36.8, right: 50, bottom: 63.1, lineBox: 33.3 },
    ]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].x).toBe(8);
    expect(pieces[0].w).toBe(174);
    expect(pieces[0].h).toBeCloseTo(27.3, 5);
    expect(pieces[0].y + pieces[0].h / 2).toBeCloseTo(16.65, 5);
    // Two lines' pieces never touch.
    expect(pieces[1].y - (pieces[0].y + pieces[0].h)).toBeCloseTo(6, 5);
  });
});

describe('in the line', () => {
  it('stands right after the sentence’s last character, glued to it, a line box tall at most', () => {
    const p = picked(['gus', 'bob']);
    const { container } = renderWithIntl(
      createElement(
        StoryPassagesContext.Provider,
        {
          value: {
            passages: [{ id: p.id, text: p.text }],
            inline: true,
            slot: (id: string) => createElement(PassageFaces, { picked: { ...p, id }, size: 24, placement: 'inline' as const, onOpen: () => {} }),
          },
        },
        createElement(StoryMarkdown, { source: '箱子堆滿了客廳，我坐在地上。窗外有人在收衣服。', script: 'cjk' as const, lang: 'zh-TW' }),
      ),
      { locale: 'zh-TW', messages: zhMessages },
    );
    const button = container.querySelector('[data-passage-faces]')!;
    const glue = button.closest('.story-passage-glue')!;
    expect(glue.firstElementChild!.textContent).toBe('。');
    expect(glue.firstElementChild!.tagName).toBe('MARK');
    // The words after it follow it in the same paragraph.
    expect(glue.nextSibling!.textContent).toBe('窗外有人在收衣服。');
    const story = readFileSync(join(process.cwd(), 'src/styles/story.css'), 'utf8');
    expect(story).toMatch(/\.story-passage-glue \{\s*white-space: nowrap;/);
    expect(story).toMatch(/\.story-passage-slot \{[^}]*height: 1lh;[^}]*margin-inline: 4px;/);
  });
});
