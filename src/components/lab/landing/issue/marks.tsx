import type { CSSProperties, ReactNode } from 'react';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { wavyLine } from '@/lib/design/wavyPath';
import s from './issue.module.css';

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/**
 * A hand-drawn rule across its box. `draw`: 'scroll' draws it in from the left as it comes into view (scroll-linked,
 * the contents' rules); 'once' draws it in one stroke when an ancestor marked `data-armed` turns `data-drawn` (a
 * floor someone will stand on: never half drawn under them); 'none' is simply there.
 */
export function PenRule({
  seed,
  className,
  amp = 1.3,
  steps = 9,
  draw = 'scroll',
}: {
  seed: number;
  className?: string;
  amp?: number;
  steps?: number;
  draw?: 'scroll' | 'once' | 'none';
}) {
  const kind = draw === 'scroll' ? s.rule : draw === 'once' ? `${s.ruleBase} ${s.ruleOnce}` : s.ruleBase;
  return (
    <svg className={[kind, className].filter(Boolean).join(' ')} viewBox="0 -4 300 8" preserveAspectRatio="none" aria-hidden="true" data-scrollfx={draw === 'scroll' ? '' : undefined}>
      <path d={wavyLine(300, seed, amp, steps)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A section's h2 that inks in as it scrolls into view: each character (each word, in Latin) from a pale light weight
 * to its full ink, one after another. Never hidden: it is read at full ink without the effect. Each character is its
 * own small box (a view timeline needs one), so CJK is kept in phrases that never break inside — a line breaks only
 * after a comma, as `word-break: keep-all` would — and Latin words break at their spaces.
 */
export function InkTitle({ id, text, className }: { id?: string; text: string; className?: string }) {
  const latin = !/[㐀-鿿]/u.test(text);
  const phrases = latin ? [text] : text.split(/(?<=[，、。！？；：])/u);
  const total = Math.max(
    1,
    phrases.reduce((n, ph) => n + (latin ? ph.split(/\s+/).filter(Boolean).length : Array.from(segmenter.segment(ph)).length), 0) - 1,
  );
  let n = 0;
  // each one's slice of the view, written out (a range resolved from a custom property isn't re-read on every
  // viewport): from the screen's foot, the last inked by the time the heading reaches the lower third
  const ink = (p: string, key: number) => {
    const f = n++ / total;
    return (
      <span key={key} className={s.ink} style={{ animationRange: `entry ${(f * 70).toFixed(1)}% cover ${(9 + f * 17).toFixed(1)}%` } as CSSProperties}>
        {p}
      </span>
    );
  };
  return (
    <h2 id={id} className={[s.h2, className].filter(Boolean).join(' ')} data-scrollfx="">
      <span className={s.srOnly}>{text}</span>
      <span aria-hidden="true">
        {latin
          ? text
              .split(/(\s+)/)
              .filter(Boolean)
              .map((p, i) => (/^\s+$/.test(p) ? p : ink(p, i)))
          : phrases.map((ph, j) => (
              <span key={j} className={s.inkPhrase}>
                {Array.from(segmenter.segment(ph), (x, i) => ink(x.segment, i))}
              </span>
            ))}
      </span>
    </h2>
  );
}

/** The brand's three waves, small: the issue's dinkus (≋). */
export function Waves({ width = 44, className, style }: { width?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={width} height={width * 0.55} viewBox="0 3 24 15" fill="none" stroke="currentColor" strokeWidth={INK} strokeLinecap="round" aria-hidden="true" className={className} style={style}>
      <path d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1" />
      <path d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0" />
      <path d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0" />
    </svg>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className={s.kicker}>
      {children}
      <svg className={s.kickerRule} viewBox="0 -4 60 8" preserveAspectRatio="none" aria-hidden="true">
        <path d={wavyLine(60, 9, 1.6, 4)} fill="none" stroke="currentColor" strokeWidth={INK_LIGHT} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
    </p>
  );
}
