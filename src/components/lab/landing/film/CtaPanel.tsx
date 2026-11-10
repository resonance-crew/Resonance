'use client';

/**
 * 重看一次: the end's quiet way back to the start of the film (the night's card itself is FilmCard's CtaCard; the
 * player's ▶ replays too once the film is over).
 */
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import type { OrganicButtonVariant } from '@/components/atoms/OrganicButton/OrganicButton';
import { copyFor } from './copy';

/** Asks the film to rewind and play (the runtime listens; without it, the page simply goes back to the top). */
export function replayFilm() {
  if (typeof window === 'undefined') return;
  const ev = new CustomEvent('film:replay', { cancelable: true });
  if (window.dispatchEvent(ev)) window.scrollTo({ top: 0, behavior: 'auto' });
}

/**
 * 重看一次 as one of the band's buttons (the landing page's closing band: its second, quieter one), in a box of its own
 * as the band's links are (CTASection's row sizes its items; a phone's stacks them, one width).
 */
export function ReplayButton({ locale, variant = 'ctaGhost', className }: { locale: string; variant?: OrganicButtonVariant; className?: string }) {
  const c = copyFor(locale).cta;
  return (
    <span className={className}>
      <OrganicButton variant={variant} onClick={replayFilm} block>
        {c.replay}
      </OrganicButton>
    </span>
  );
}
