// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSWR, { SWRConfig } from 'swr';
import { act, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import type { AuthorBody, CardTapBody, TapPickedBody } from '@/lib/api/v1/schemas';
import { cardPageKey } from '@/lib/data/hooks';
import { RICH_STORY_EN, RICH_STORY_EN_PASSAGES, RICH_STORY_PASSAGES } from '../../../../scripts/seed/pinned';
import { ReadAfterArea } from './ReadAfterArea';
import { StoryMarkdown, StoryPassagesContext } from './StoryMarkdown';
import { tapInTranslation } from './translatedPassages';

/**
 * Round 31 (the owner, 2026-11-23: 「如果我讀翻譯的文章，譬如說中文翻成英文，那我這邊顯示的清單三句應該也要都翻成
 * 英文才對哦……它這個句子還要可以對應回去原本的那個標在畫面上」): a reader reading the story in translation is offered
 * the passages after 共振 in the translation's words, picks by the original's id, and sees the sentences readers
 * picked marked where the translation says them. The card page hands ReadAfterArea and PassageMarks the tap
 * `tapInTranslation` makes of the translation's answer (CardDetailClient).
 */

const auth = vi.hoisted(() => ({ value: { user: { id: 'viewer' } as { id: string } | null, loading: false } }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth.value }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/providers/ToastProvider', () => ({ useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }) }));
const me = { id: 'viewer', handle: 'viewer-handle', initials: 'VI', accentColor: 'var(--accent)', avatarSeed: '4', verified: false, region: 'TW' };
vi.mock('@/lib/data/hooks', async (original) => ({
  ...(await original<typeof import('@/lib/data/hooks')>()),
  useMyProfile: () => ({ data: me }),
  useMyResonance: () => ({ data: null }),
  useMyCardBox: () => ({ data: undefined, mutate: vi.fn() }),
}));
vi.mock('@/lib/data/cardPrefill', async (original) => ({ ...(await original<typeof import('@/lib/data/cardPrefill')>()), usePrefillCard: () => vi.fn() }));
const setTap = vi.fn((..._a: unknown[]) => Promise.resolve({ on: true, changed: true }));
const setTapPassage = vi.fn((..._a: unknown[]): Promise<{ passage: string | null }> => Promise.resolve({ passage: null }));
vi.mock('@/lib/db/firestore/client/taps', () => ({
  setTap: (...a: unknown[]) => setTap(...a),
  setTapPassage: (...a: unknown[]) => setTapPassage(...a),
  listTaps: () => new Promise(() => {}),
}));
vi.mock('@/lib/db/firestore/client/notes', () => ({ sendNote: vi.fn(), NOTE_MAX_LENGTH: 2000 }));
vi.mock('@/lib/hints', () => ({ useHint: () => ({ visible: true, dismiss: vi.fn() }) }));

const face = (id: string): AuthorBody => ({ id, handle: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null });
const PICKED: TapPickedBody[] = [
  { id: RICH_STORY_PASSAGES[0].id, text: RICH_STORY_PASSAGES[0].text, people: [face('gus'), face('bob')], more: false },
  { id: RICH_STORY_PASSAGES[1].id, text: RICH_STORY_PASSAGES[1].text, people: [face('carol')], more: false },
  // A pick of a sentence the card no longer offers: no translation says it.
  { id: 'old00000', text: '有些東西在打包的時候就決定留下了。', people: [face('hana')], more: false },
];
const TAP: CardTapBody = { mine: false, faces: [], more: false, mayNote: true, passages: RICH_STORY_PASSAGES, passage: null, picked: PICKED };

beforeEach(() => {
  auth.value = { user: { id: 'viewer' }, loading: false };
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe('tapInTranslation', () => {
  it('gives the passages and picked sentences the translation says, in the card’s order, by id — the rest of the tap as it was', () => {
    const shown = tapInTranslation(TAP, [...RICH_STORY_EN_PASSAGES].reverse());
    expect(shown?.passages).toEqual(RICH_STORY_EN_PASSAGES);
    expect(shown?.picked?.map((p) => [p.id, p.text, p.people.map((a) => a.id)])).toEqual([
      [RICH_STORY_PASSAGES[0].id, RICH_STORY_EN_PASSAGES[0].text, ['gus', 'bob']],
      [RICH_STORY_PASSAGES[1].id, RICH_STORY_EN_PASSAGES[1].text, ['carol']],
    ]);
    expect(shown).toMatchObject({ mine: false, mayNote: true, passage: null });
  });

  it('offers only what the translation says, and nothing when it says none', () => {
    expect(tapInTranslation(TAP, [RICH_STORY_EN_PASSAGES[2]])?.passages).toEqual([RICH_STORY_EN_PASSAGES[2]]);
    expect(tapInTranslation(TAP, undefined)).toMatchObject({ passages: [], picked: [] });
    expect(tapInTranslation(null, RICH_STORY_EN_PASSAGES)).toBeNull();
    expect(tapInTranslation(undefined, RICH_STORY_EN_PASSAGES)).toBeUndefined();
  });
});

/** The card page's end in translation: the tap as the page hands it over (tapInTranslation), the flag as it sets it. */
function Page({ tap }: { tap: CardTapBody }) {
  const { data } = useSWR(cardPageKey('c1', 'viewer'), () =>
    Promise.resolve({ resonances: { cards: [], authors: {} }, related: { cards: [], authors: {} }, links: { cards: [], authors: {} }, embeds: { cards: [], authors: {} }, tap }),
  );
  const shown = tapInTranslation(data?.tap, RICH_STORY_EN_PASSAGES);
  return (
    <ReadAfterArea
      cardId="c1"
      cardTitle="Title"
      author={{ id: 'alice', handle: 'alice', initials: 'AL', accentColor: 'x' }}
      tap={shown}
      translated={!shown?.passages?.length}
      script="latin"
    />
  );
}

describe('the passages’ dialog in translation (§R1)', () => {
  it('offers the translation’s words after 共振 and keeps the pick by the original’s id', async () => {
    renderWithIntl(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 60_000, revalidateOnFocus: false }}>
        <Page tap={{ ...TAP, picked: undefined }} />
      </SWRConfig>,
    );
    await act(async () => {});
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(within(screen.getAllByRole('group')[0]).getByRole('button', { name: 'Resonate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Which part stayed with you' });
    const rows = [...dialog.querySelectorAll<HTMLButtonElement>('[data-passage]')];
    expect(rows.map((r) => [r.dataset.passage, r.textContent?.trim()])).toEqual(RICH_STORY_EN_PASSAGES.map((p) => [p.id, p.text]));
    // No Chinese left in it: the rows are the translation's own words.
    expect(dialog.textContent).not.toMatch(/[一-鿿]/);

    await user.click(rows[1]);
    await act(async () => {});
    expect(setTapPassage).toHaveBeenLastCalledWith('c1', RICH_STORY_PASSAGES[1].id);
  });
});

/**
 * The translated story with the picked sentences as PassageMarks hands them to it (its context: which sentences, by
 * id and words). PassageMarks itself waits for a layout jsdom doesn't have (its margin's room), so the context is
 * given here as it gives it — what this asks is that the translation's words are found and marked in the translation.
 */
function TranslatedStory({ picked }: { picked: readonly TapPickedBody[] | undefined }) {
  return (
    <StoryPassagesContext.Provider value={{ passages: (picked ?? []).map((p) => ({ id: p.id, text: p.text })), inline: true, slot: () => null }}>
      <StoryMarkdown source={RICH_STORY_EN} script="latin" lang="en" />
    </StoryPassagesContext.Provider>
  );
}

describe('the picked sentences in translation (§R2)', () => {
  it('marks each picked sentence where the translation says it, and never one the translation lacks', () => {
    const { container } = renderWithIntl(<TranslatedStory picked={tapInTranslation(TAP, RICH_STORY_EN_PASSAGES)?.picked} />);
    const marks = [...container.querySelectorAll<HTMLElement>('[data-passage]')];
    const byId = (id: string) => marks.filter((m) => m.dataset.passage === id).map((m) => m.textContent).join('').replace(/\s+/g, ' ').trim();
    expect(byId(RICH_STORY_PASSAGES[0].id)).toBe(RICH_STORY_EN_PASSAGES[0].text);
    expect(byId(RICH_STORY_PASSAGES[1].id)).toBe(RICH_STORY_EN_PASSAGES[1].text);
    expect(marks.some((m) => m.dataset.passage === 'old00000')).toBe(false);
    // The third passage was offered but nobody picked it: no mark.
    expect(marks.some((m) => m.dataset.passage === RICH_STORY_PASSAGES[2].id)).toBe(false);
  });
});
