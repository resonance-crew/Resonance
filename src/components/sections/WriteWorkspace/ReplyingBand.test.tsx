// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const original = vi.hoisted(() => ({
  card: { id: 'rain-walk', thoughtCore: '一場雨後的散步', accentHue: 215, media: { type: 'image', url: 'https://img.example/rain.webp' } } as Record<string, unknown>,
}));
vi.mock('@/lib/data/hooks', () => ({ useCard: () => ({ data: { card: original.card, author: { id: 'bob' } } }) }));

const zh = { locale: 'zh-TW', messages: zhMessages };
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
