// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import zhMessages from '@/messages/zh-TW.json';
import { WriteWorkspace } from './WriteWorkspace';

/**
 * Round 26 §U6: writing a reply below the split, nothing showed the story being answered. A 44 band over the title
 * now says what it answers — the original's cover at 36 and 「回應〈…〉」 — and opens the original in a centred
 * dialog; at the split the original stands beside the writer, and the band isn't there.
 */

const split = vi.hoisted(() => ({ value: false as boolean | null }));
vi.mock('@/lib/hooks/useMediaQuery', () => ({ useMediaQuery: () => split.value }));
vi.mock('@/lib/hooks/useLeaveWriter', () => ({ useLeaveWriter: () => vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
// The shell's map and bar are its own suite's: here, what it holds in its pane (and what it lays beside it).
vi.mock('./WorkspaceShell', () => ({
  WorkspaceShell: ({ children, leftOverride }: { children: ReactNode; leftOverride?: ReactNode }) => (
    <div>
      {split.value && <aside data-testid="beside">{leftOverride}</aside>}
      {children}
    </div>
  ),
}));
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({ CardEditor: () => <textarea aria-label="Title" /> }));
vi.mock('./LazyOriginalCardPanel', () => ({ OriginalCardPanel: ({ cardId }: { cardId: string }) => <article>the original {cardId}</article> }));
const RAIN_WALK = { id: 'rain-walk', thoughtCore: '一場雨後的散步', accentHue: 215, media: { type: 'image', url: 'https://img.example/rain.webp' } };
const original = vi.hoisted(() => ({
  card: {} as Record<string, unknown>,
  /** What useCard answers instead of the card: still reading (undefined), not readable (null), or the read failed. */
  read: null as null | { data: undefined | null; error?: Error },
}));
vi.mock('@/lib/data/hooks', () => ({
  useCard: () => original.read ?? { data: { card: original.card, author: { id: 'bob' } } },
}));

const zh = { locale: 'zh-TW', messages: zhMessages };
beforeEach(() => {
  original.card = RAIN_WALK;
  original.read = null;
});
afterEach(() => {
  split.value = false;
  vi.clearAllMocks();
});

describe('ReplyingBand', () => {
  it('says above the title, below the split, which story the reply answers — its cover at 36', () => {
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
    const band = screen.getByRole('button', { name: '回應〈一場雨後的散步〉' });
    // Over the title: before the editor in the page.
    expect(band.compareDocumentPosition(screen.getByRole('textbox', { name: 'Title' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(band.querySelector('img')?.getAttribute('src')).toBe('https://img.example/rain.webp');
  });

  it("draws the cover's 960 px copy when it has one, never the 2048 px cover in a 36 tile", () => {
    original.card = { ...RAIN_WALK, media: { type: 'image', url: 'https://img.example/rain.webp', thumbUrl: 'https://img.example/rain-w960.webp' } };
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
    const band = screen.getByRole('button', { name: '回應〈一場雨後的散步〉' });
    expect(band.querySelector('img')?.getAttribute('src')).toBe('https://img.example/rain-w960.webp');
  });

  it('opens the original in a centred dialog, the writing left under it', async () => {
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
    await userEvent.click(screen.getByRole('button', { name: '回應〈一場雨後的散步〉' }));
    const dialog = screen.getByRole('dialog', { name: '原文章' });
    expect(within(dialog).getByText('the original rain-walk')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '關閉' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a coverless original’s first character on its own colours', () => {
    original.card = { id: 'plain', thoughtCore: '陌生人的一句話', accentHue: 140 };
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="plain" />, zh);
    const band = screen.getByRole('button', { name: '回應〈陌生人的一句話〉' });
    expect(band.querySelector('img')).toBeNull();
    expect(band).toHaveTextContent('陌');
  });

  it('keeps its room while the original is read, and leaves nothing once it can’t be read or has no title', () => {
    original.read = { data: undefined };
    const reading = renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
    expect(document.querySelector('[data-pending]')).not.toBeNull();
    reading.unmount();

    // Deleted, trashed or hidden by a block (useCard's null), or the read failing: no blank row over the title.
    for (const read of [{ data: null }, { data: undefined, error: new Error('permission-denied') }]) {
      original.read = read;
      const gone = renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
      expect(document.querySelector('[data-pending]')).toBeNull();
      expect(screen.queryByRole('button', { name: /回應〈/ })).toBeNull();
      gone.unmount();
    }

    original.read = null;
    original.card = { id: 'blank', thoughtCore: '  ', accentHue: 140 };
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="blank" />, zh);
    expect(screen.queryByRole('button', { name: /回應〈/ })).toBeNull();
    expect(document.querySelector('[data-pending]')).toBeNull();
  });

  it('is not there at the split, where the original stands beside the writer — nor on a card answering nothing', () => {
    split.value = true;
    const { unmount } = renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" referenceCardId="rain-walk" />, zh);
    expect(screen.queryByRole('button', { name: /回應〈/ })).toBeNull();
    expect(screen.getByTestId('beside')).toHaveTextContent('the original rain-walk');
    unmount();

    split.value = false;
    renderWithIntl(<WriteWorkspace title="寫卡片" locale="zh-TW" />, zh);
    expect(screen.queryByRole('button', { name: /回應〈/ })).toBeNull();
  });
});
