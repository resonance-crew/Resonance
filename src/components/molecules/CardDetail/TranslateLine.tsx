'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { Icon } from '@/components/atoms/Icon/Icon';
import { useToast } from '@/components/providers/ToastProvider';
import { useAutoTranslate } from '@/components/providers/TweaksPanel';
import { TRANSLATE_MAX_CHARS, translationTargets, type TranslationTarget } from '@/lib/text/translation';
import styles from './TranslateLine.module.css';

/**
 * A story read in the interface's language (round 25 §F2–F4). The card page asks `useStoryTranslation` what to show;
 * the line under the byline is the reader's control of it — never in ⋯ (a signed-out reader has none; a menu can't
 * say that a translation is showing). The server translates (POST /api/v1/cards/{key}/translation, kept per card).
 */

/** The interface language a reader's locale reads in. */
export const translateTarget = (locale: string): TranslationTarget => (locale === 'en' ? 'en' : 'zh-TW');

export interface TranslatableCard {
  id: string;
  slug?: string | null;
  thoughtCore: string;
  story: string;
  publishedAt?: unknown;
  visibility?: string;
  trashedAt?: unknown;
}

/**
 * Whether a card's page offers a translation, and into which language (§F3): published and public (named or
 * anonymous), not the viewer's own, its script another than the interface's, at most 30,000 characters.
 */
export function translateOffer(card: TranslatableCard, { isOwner, locale }: { isOwner: boolean; locale: string }): TranslationTarget | null {
  if (isOwner || !card.publishedAt || card.visibility !== 'public' || card.trashedAt) return null;
  if (card.thoughtCore.length + card.story.length > TRANSLATE_MAX_CHARS) return null;
  const to = translateTarget(locale);
  return translationTargets(card.thoughtCore, card.story).includes(to) ? to : null;
}

export type TranslateState = 'can' | 'working' | 'translated' | 'original' | 'failed' | 'spent';
export interface Translation {
  title: string;
  story: string;
}

/** The cards kept original for the rest of this visit (顯示原文 under the auto-translate switch). */
const keptOriginal = new Set<string>();
/** Forgets this visit's 顯示原文s (tests). */
export function forgetKeptOriginals(): void {
  keptOriginal.clear();
}

/** What the server answered, as the line reads it. */
type Asked = { ok: true; translation: Translation } | { ok: false; why: 'spent' | 'failed' | 'signin' };

async function askTranslation(key: string, to: TranslationTarget): Promise<Asked> {
  try {
    const res = await fetch(`/api/v1/cards/${encodeURIComponent(key)}/translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ to }),
    });
    if (res.ok) {
      const body = (await res.json()) as { title?: unknown; story?: unknown };
      if (typeof body.title === 'string' && typeof body.story === 'string') return { ok: true, translation: { title: body.title, story: body.story } };
      return { ok: false, why: 'failed' };
    }
    if (res.status === 429) return { ok: false, why: 'spent' };
    if (res.status === 401) return { ok: false, why: 'signin' };
    return { ok: false, why: 'failed' };
  } catch {
    return { ok: false, why: 'failed' };
  }
}

/** The story's top block in view (below `top` px), and how far from the window's top it stands. */
function topBlock(story: HTMLElement | null, top: number): { index: number; y: number } | null {
  const prose = story?.querySelector('.story-prose') ?? story;
  if (!prose) return null;
  const blocks = Array.from(prose.children);
  for (let i = 0; i < blocks.length; i++) {
    const r = blocks[i].getBoundingClientRect();
    if (r.bottom > top) return { index: i, y: r.top };
  }
  return null;
}

export interface StoryTranslation {
  /** Whether the page shows the line at all. */
  offered: boolean;
  state: TranslateState;
  /** The words to show in place of the card's, or null for the original. */
  shown: Translation | null;
  /** Bumped at each swap: whatever is measured from the story is measured again. */
  swaps: number;
  /** The line's own element, to tell whether it is in view when a translation arrives. */
  lineRef: RefObject<HTMLDivElement | null>;
  /** The control: translate, show the original, show the translation again, try again. */
  act: () => void;
  /** What the polite live region says after a swap. */
  announce: string;
}

/**
 * The card page's translation (§F2–F4). Signed out, the control goes to sign-in. With 自動翻譯 on, a page that offers
 * the line asks as it opens and shows the original with 「翻譯中⋯」; when the translation comes, it swaps in if the
 * line is in view, and otherwise the shell's toast offers it, keeping the top visible block where it was.
 */
export function useStoryTranslation({
  card,
  isOwner,
  signedIn,
  locale,
  storyRef,
  onSignIn,
}: {
  card: TranslatableCard | null;
  isOwner: boolean;
  signedIn: boolean;
  locale: string;
  storyRef: RefObject<HTMLElement | null>;
  onSignIn: () => void;
}): StoryTranslation {
  const t = useTranslations('card.translate');
  const toast = useToast();
  const auto = useAutoTranslate();
  const to = card ? translateOffer(card, { isOwner, locale }) : null;
  const key = card ? (card.slug || card.id) : '';
  const [state, setState] = useState<TranslateState>('can');
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [showing, setShowing] = useState(false);
  const [swaps, setSwaps] = useState(0);
  const [announce, setAnnounce] = useState('');
  const lineRef = useRef<HTMLDivElement | null>(null);
  const anchor = useRef<{ index: number; y: number } | null>(null);
  const asked = useRef('');

  // a new card (or language): start again
  const ident = `${card?.id ?? ''}|${to ?? ''}|${card?.thoughtCore.length ?? 0}:${card?.story.length ?? 0}`;
  const [seen, setSeen] = useState(ident);
  if (seen !== ident) {
    setSeen(ident);
    setState('can');
    setTranslation(null);
    setShowing(false);
  }

  const swapIn = useCallback(
    (on: boolean, keepPlace = false) => {
      anchor.current = keepPlace ? topBlock(storyRef.current, 0) : null;
      setShowing(on);
      setState(on ? 'translated' : 'original');
      setSwaps((n) => n + 1);
      setAnnounce(on ? t('announce') : '');
    },
    [storyRef, t],
  );

  const translate = useCallback(
    async (byItself: boolean) => {
      if (!card || !to) return;
      setState('working');
      const answer = await askTranslation(key, to);
      if (asked.current !== ident) return; // the page moved on to another card
      if (!answer.ok) {
        if (answer.why === 'signin') onSignIn();
        setState(answer.why === 'spent' ? 'spent' : answer.why === 'signin' ? 'can' : 'failed');
        return;
      }
      setTranslation(answer.translation);
      const line = lineRef.current?.getBoundingClientRect();
      const inView = !line || (line.bottom >= 0 && line.top <= window.innerHeight);
      if (!byItself || inView) {
        swapIn(true);
        return;
      }
      // scrolled past the line: nothing moves; the toast offers it
      setState('original');
      toast.show({ message: t('ready'), action: { label: t('show'), ariaLabel: `${t('ready')} · ${t('show')}`, icon: 'globe', onAction: () => swapIn(true, true) } });
    },
    [card, to, key, ident, onSignIn, swapIn, t, toast],
  );

  // 自動翻譯: ask as the page opens (once per card), unless 顯示原文 kept this card original for the visit
  useEffect(() => {
    if (!auto || !to || !signedIn || !card || keptOriginal.has(card.id) || asked.current === ident) return;
    asked.current = ident;
    void translate(true);
  }, [auto, to, signedIn, card, ident, translate]);

  // after a swap from the toast: the block that was at the top stands where it stood
  useLayoutEffect(() => {
    const was = anchor.current;
    anchor.current = null;
    if (!was) return;
    const prose = storyRef.current?.querySelector('.story-prose') ?? storyRef.current;
    const block = prose?.children[Math.min(was.index, (prose?.children.length ?? 1) - 1)];
    if (!block) return;
    const dy = block.getBoundingClientRect().top - was.y;
    if (Math.abs(dy) > 0.5) window.scrollBy(0, dy);
  }, [swaps, storyRef]);

  // whatever is measured from the story (the ends apart, the contents rail, the reading stage) measures again
  useEffect(() => {
    if (!swaps) return;
    const id = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => window.cancelAnimationFrame(id);
  }, [swaps]);

  const act = useCallback(() => {
    if (!card || !to) return;
    if (!signedIn) {
      onSignIn();
      return;
    }
    if (state === 'translated') {
      keptOriginal.add(card.id);
      swapIn(false);
    } else if (state === 'original' && translation) swapIn(true);
    else if (state === 'can' || state === 'failed' || state === 'original') {
      asked.current = ident;
      void translate(false);
    }
  }, [card, to, signedIn, state, translation, ident, onSignIn, swapIn, translate]);

  return { offered: !!to, state, shown: showing ? translation : null, swaps, lineRef, act, announce };
}

/** The line itself: plain words in the meta ink, the control in the story links' accent ink (§F2's table). */
export function TranslateLine({ tr }: { tr: StoryTranslation }) {
  const t = useTranslations('card.translate');
  const comma = useLocale() === 'en' ? ', ' : '，';
  if (!tr.offered) return null;
  const control = (words: string) => (
    <button type="button" className={styles.control} onClick={tr.act}>
      {words}
    </button>
  );
  let body: React.ReactNode;
  switch (tr.state) {
    case 'can':
      body = (
        <button type="button" className={styles.control} onClick={tr.act}>
          <span className={styles.glyph} aria-hidden="true">
            <Icon name="globe" size={16} />
          </span>
          {t('action')}
        </button>
      );
      break;
    case 'working':
      body = (
        <span className={styles.working} role="status">
          <span className={styles.glyph} aria-hidden="true">
            <ButtonLoader size={16} />
          </span>
          {t('working')}
        </span>
      );
      break;
    case 'translated':
      body = (
        <>
          <span className={styles.plain}>{t('done')}</span>
          <span className={styles.plain} aria-hidden="true">
            ·
          </span>
          {control(t('showOriginal'))}
        </>
      );
      break;
    case 'original':
      body = control(t('showTranslation'));
      break;
    case 'failed':
      body = (
        <>
          <span className={styles.plain}>{`${t('failed')}${comma}`}</span>
          {control(t('retry'))}
        </>
      );
      break;
    case 'spent':
      body = <span className={styles.plain}>{t('spent')}</span>;
      break;
  }
  return (
    <div ref={tr.lineRef} className={styles.line} data-translate={tr.state}>
      {body}
      <span className={styles.announce} aria-live="polite">
        {tr.announce}
      </span>
    </div>
  );
}
