// @vitest-environment jsdom
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import type { AuthorBody, CardTapBody } from '@/lib/api/v1/schemas';
import { TapFaces } from '@/components/molecules/CardDetail/TapFaces';
import { withMine } from './taps';

/**
 * Round 26 §U2.3: the viewer's tap flips at once on the card page, before the server answers (or puts it back). The
 * faces' list is kept whole through it — cut to three only where it is drawn — so turning the tap on and off again
 * gives every face back, as the apps do (Android e3f7967c). It once cut [me, dora, eli, fay] to three on the way in
 * and kept `more`, so off again showed dora, eli and a blank disc where fay had been.
 */

vi.mock('@/lib/db/firestore/client/taps', () => ({ setTap: vi.fn(), listTaps: vi.fn(() => new Promise(() => {})) }));

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const [alice, dora, eli, fay] = ['alice', 'dora', 'eli', 'fay'].map(face);
const READ: CardTapBody = { mine: false, faces: [dora, eli, fay], more: false, mayNote: true };

function drawn(tap: CardTapBody) {
  const page = renderWithIntl(
    createElement(SWRConfig, { value: { provider: () => new Map() } }, createElement(TapFaces, { cardId: 'c1', tap, viewerId: 'alice' })),
    { locale: 'zh-TW', messages: zhMessages },
  );
  const faces = [...page.container.querySelectorAll('[data-face]')].map((f) => f.getAttribute('data-face'));
  const disc = !!page.container.querySelector('[data-more]');
  const name = screen.getByRole('button').getAttribute('aria-label');
  page.unmount();
  return { faces, disc, name };
}

describe('withMine', () => {
  it('gives every face back when the tap goes on and off again (and when a refused one is put back)', () => {
    const on = withMine(READ, true, alice);
    expect(on).toEqual({ mine: true, faces: [alice, dora, eli, fay], more: false, mayNote: true });
    expect(withMine(on, false, alice)).toEqual(READ);
    // Twice on is still one face of the viewer's.
    expect(withMine(on, true, alice).faces).toEqual([alice, dora, eli, fay]);
  });

  it('draws the tap on as three faces and the blank disc, and off again as the three it had', () => {
    const on = drawn(withMine(READ, true, alice));
    expect(on.faces).toEqual(['alice', 'dora', 'eli']);
    expect(on.disc).toBe(true);
    expect(on.name).toBe('你共振了，你連結的人裡，與這張卡片共振的：dora、eli，還有其他人');

    const off = drawn(withMine(withMine(READ, true, alice), false, alice));
    expect(off.faces).toEqual(['dora', 'eli', 'fay']);
    expect(off.disc).toBe(false);
    expect(off.name).toBe('你連結的人裡，與這張卡片共振的：dora、eli、fay');
  });
});
