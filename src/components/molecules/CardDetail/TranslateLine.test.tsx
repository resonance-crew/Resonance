// @vitest-environment jsdom
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhMessages from '@/messages/zh-TW.json';
import { act, fireEvent, renderWithIntl, screen, waitFor } from '@/../test/render';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { TWEAKS_KEY } from '@/lib/design/appearance';
import { forgetTweaksRead } from '@/components/providers/TweaksPanel';
import { forgetKeptOriginals, translateOffer, TranslateLine, useStoryTranslation, type TranslatableCard } from './TranslateLine';

/**
 * §F2–F4 (round 25): the translate line under a card's byline — every state, which cards get it, the auto-translate
 * switch's rule, the toast when the reader has scrolled past it, and the page measuring again after a swap.
 */

const ZH: TranslatableCard = {
  id: 'c-rain',
  slug: 'rain-walk',
  thoughtCore: '雨中的散步',
  story: '那天下著雨，我們沿著河走了很久。\n\n## 河邊\n\n水聲很近。',
  publishedAt: new Date('2026-10-01'),
  visibility: 'public',
};
const EN_TRANSLATION = { to: 'en', title: 'A walk in the rain', story: 'It rained that day; we walked the river a long time.\n\n## By the river\n\nThe water was close.' };

/** A card page in miniature: the line, then the shown title and story, as CardDetailClient lays them out. */
function Page({ card = ZH, isOwner = false, signedIn = true, authLoading = false, locale = 'en', onSignIn = () => {} }: { card?: TranslatableCard; isOwner?: boolean; signedIn?: boolean; authLoading?: boolean; locale?: string; onSignIn?: () => void }) {
  const storyRef = useRef<HTMLDivElement>(null);
  const tr = useStoryTranslation({ card, isOwner, signedIn, authLoading, locale, storyRef, onSignIn });
  return (
    <>
      <TranslateLine tr={tr} />
      <h1 data-testid="title">{tr.shown?.title ?? card.thoughtCore}</h1>
      <div ref={storyRef} data-testid="story" data-swaps={tr.swaps}>
        <div className="story-prose">
          {(tr.shown?.story ?? card.story).split('\n\n').map((b, i) => (
            <p key={i}>{b}</p>
          ))}
        </div>
      </div>
    </>
  );
}

const draw = (props: Parameters<typeof Page>[0] = {}, locale = props.locale ?? 'en') =>
  renderWithIntl(
    <ToastProvider>
      <Page {...props} />
    </ToastProvider>,
    locale === 'zh-TW' ? { locale, messages: zhMessages } : { locale },
  );

const lineEl = () => document.querySelector('[data-translate]') as HTMLElement;
const fetchMock = vi.fn();
function answer(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  forgetTweaksRead();
  forgetKeptOriginals();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const autoOn = () => {
  window.localStorage.setItem(TWEAKS_KEY, JSON.stringify({ autoTranslate: true }));
  forgetTweaksRead();
};

describe('which stories get the line (§F3)', () => {
  it('a published public story in another script than the interface', () => {
    expect(translateOffer(ZH, { isOwner: false, locale: 'en' })).toBe('en');
    expect(translateOffer({ ...ZH, thoughtCore: 'Rain', story: 'We walked by the river.' }, { isOwner: false, locale: 'zh-TW' })).toBe('zh-TW');
  });

  it('never the viewer’s own, a private or unpublished card, one in the interface’s script, or one too long', () => {
    expect(translateOffer(ZH, { isOwner: true, locale: 'en' })).toBeNull();
    expect(translateOffer({ ...ZH, visibility: 'private' }, { isOwner: false, locale: 'en' })).toBeNull();
    expect(translateOffer({ ...ZH, publishedAt: null }, { isOwner: false, locale: 'en' })).toBeNull();
    expect(translateOffer(ZH, { isOwner: false, locale: 'zh-TW' })).toBeNull();
    expect(translateOffer({ ...ZH, story: '雨'.repeat(30_001) }, { isOwner: false, locale: 'en' })).toBeNull();
  });

  it('counts only the story toward the 30,000 characters, as the server and the apps do', () => {
    expect(translateOffer({ ...ZH, thoughtCore: '雨中的散步，長長的標題', story: '雨'.repeat(30_000) }, { isOwner: false, locale: 'en' })).toBe('en');
  });

  it('while auth settles: no line (it could be the owner’s own card), and nothing goes to sign-in', () => {
    const onSignIn = vi.fn();
    const { container } = draw({ isOwner: false, signedIn: false, authLoading: true, onSignIn });
    expect(container.querySelector('[data-translate]')).toBeNull();
    expect(onSignIn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('draws nothing where there is no offer', () => {
    const { container } = draw({ isOwner: true });
    expect(container.querySelector('[data-translate]')).toBeNull();
  });
});

describe('the line’s states (§F2)', () => {
  it('translates on a tap, then shows the original and the translation again', async () => {
    answer(200, EN_TRANSLATION);
    draw();
    const go = screen.getByRole('button', { name: 'Translate to English' });
    fireEvent.click(go);
    expect(lineEl()).toHaveTextContent('Translating…');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/cards/rain-walk/translation', expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'en' }) }));
    expect(screen.getByText('Translated by AI')).toBeInTheDocument();
    expect(screen.getByText('Translated to English')).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.getByTestId('title')).toHaveTextContent('雨中的散步');
    fireEvent.click(screen.getByRole('button', { name: 'Show translation' }));
    expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain');
    expect(fetchMock).toHaveBeenCalledTimes(1); // the translation in hand is shown again, not asked for
  });

  // W21: coming back to the card this visit shows its translation again without a second POST.
  it('shows a translation this visit was given again when the card is opened again, asking nothing', async () => {
    answer(200, EN_TRANSLATION);
    const first = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    first.unmount();
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Post-merge review: an edit of the same length is a new story, asked for again.
  it('asks again for a card whose words changed and kept their length', async () => {
    answer(200, EN_TRANSLATION);
    const first = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    first.unmount();
    answer(200, EN_TRANSLATION);
    draw({ card: { ...ZH, story: ZH.story.replace('河邊', '橋邊') } });
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('a failure offers to try again; a spent budget says so and offers nothing', async () => {
    answer(503, { error: { code: 'internal' } });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await screen.findByText('Couldn’t translate,');
    answer(429);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No more translations today');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('in 繁體中文: 翻譯成中文, then 已由 AI 翻譯 · 顯示原文 — and 沒有翻好，再試一次', async () => {
    const latin = { ...ZH, slug: 'bridge-rain', thoughtCore: 'Bridge in the rain', story: 'We met on the bridge.' };
    answer(200, { to: 'zh-TW', title: '雨中的橋', story: '我們在橋上相遇。' });
    draw({ card: latin, locale: 'zh-TW' });
    fireEvent.click(screen.getByRole('button', { name: '翻譯成中文' }));
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('雨中的橋'));
    expect(screen.getByText('已由 AI 翻譯')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '顯示原文' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/cards/bridge-rain/translation', expect.objectContaining({ body: JSON.stringify({ to: 'zh-TW' }) }));
  });

  it('signed out, the line shows and its tap goes to sign-in', () => {
    const onSignIn = vi.fn();
    draw({ signedIn: false, onSignIn });
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    expect(onSignIn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('自動翻譯 (§F4)', () => {
  it('off (the default): nothing is asked until the line is tapped', () => {
    draw();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Translate to English' })).toBeInTheDocument();
  });

  it('on: the page asks as it opens, shows the original with 翻譯中⋯, and swaps when the line is in view', async () => {
    autoOn();
    answer(200, EN_TRANSLATION);
    draw();
    expect(screen.getByTestId('title')).toHaveTextContent('雨中的散步');
    expect(lineEl()).toHaveTextContent('Translating…');
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on, scrolled past the line: nothing moves; the toast offers it, and keeps the top block where it was', async () => {
    autoOn();
    let release!: () => void;
    fetchMock.mockReturnValueOnce(new Promise((res) => (release = () => res({ ok: true, status: 200, json: async () => EN_TRANSLATION }))));
    draw();
    // the reader has scrolled on: the line is above the window, the story's second block at its top
    const line = document.querySelector('[data-translate]') as HTMLElement;
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -400, 300, 20));
    const blocks = () => Array.from(screen.getByTestId('story').querySelectorAll('p'));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const i = blocks().indexOf(this as HTMLParagraphElement);
      // after the swap the translated blocks stand 30 px lower than the original ones did
      if (i >= 0) return new DOMRect(0, -200 + i * 150 + (/[A-Za-z]/.test(this.textContent ?? '') ? 30 : 0), 300, 120);
      if (this === line) return new DOMRect(0, -400, 300, 20);
      return new DOMRect(0, 0, 0, 0);
    });
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    await act(async () => release());
    expect(screen.getByTestId('title')).toHaveTextContent('雨中的散步');
    expect(screen.getAllByText('Translation ready').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Translation ready · Show/ }));
    expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain');
    expect(scrollBy).toHaveBeenCalledWith(0, 30);
  });

  it('顯示原文 keeps that card original for the rest of the visit', async () => {
    autoOn();
    answer(200, EN_TRANSLATION);
    const first = draw();
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('A walk in the rain'));
    fireEvent.click(screen.getByRole('button', { name: 'Show original' }));
    first.unmount();
    draw();
    expect(screen.getByTestId('title')).toHaveTextContent('雨中的散步');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never asks for the viewer’s own card or signed out', () => {
    autoOn();
    draw({ isOwner: true });
    draw({ signedIn: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('after a swap', () => {
  it('whatever is measured from the story measures again (a resize is told)', async () => {
    answer(200, EN_TRANSLATION);
    const told = vi.fn();
    window.addEventListener('resize', told);
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Translate to English' }));
    await waitFor(() => expect(screen.getByTestId('story')).toHaveAttribute('data-swaps', '1'));
    await waitFor(() => expect(told).toHaveBeenCalled());
    window.removeEventListener('resize', told);
  });
});
