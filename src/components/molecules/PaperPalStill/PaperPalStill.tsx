import type { CSSProperties } from 'react';
import type { Still, StillPart } from '@/lib/mascots/pals/still';
import styles from './PaperPalStill.module.css';

export interface PaperPalStillProps {
  still: Still;
  /** The arm that waves when the still says hello. */
  waveArm?: 'l' | 'r';
  /** Its eyes at rest: 悄悄 may stand there half asleep (`sleepy`, when it has those eyes). */
  eyes?: 'open' | 'sleepy';
  /** Seconds into its blink and breath cycles, so five standing together never blink as one. */
  phase?: number;
  className?: string;
}

/** What a part does in the still: shown at rest, a blink's or a hello's swap, or never drawn. */
function roleOf(p: StillPart, eyes: 'open' | 'sleepy', hasSleepy: boolean): string | null {
  const base = p.variantOf;
  if (!base) {
    if (p.name === 'eye-l' || p.name === 'eye-r') return eyes === 'sleepy' && hasSleepy ? 'off' : 'eye';
    if (p.name === 'mouth') return 'mouth';
    return 'rest';
  }
  if (p.name.endsWith('-shut')) return 'shut';
  if (p.name.endsWith('-sleepy')) return eyes === 'sleepy' ? 'eye' : 'off';
  if (p.name === 'mouth-open' || p.name === 'mouth-o') return p.name;
  return 'off';   // torso-alt, the nap's eyes: the stage's, not the still's
}

/**
 * One Paper Pal standing at rest, drawn from its part images (lib/mascots/pals/still): it breathes and blinks now and
 * then, and says hello — eyes shut in a smile, one arm raised and waving — while an ancestor is marked `data-hello`
 * (or one marked `data-hello-hover` is hovered). Sized by the `--unit` its parent sets (px for 摺摺's height);
 * decoration (`aria-hidden`): whoever places it names it.
 */
export function PaperPalStill({ still, waveArm = 'l', eyes = 'open', phase = 0, className }: PaperPalStillProps) {
  const hasSleepy = still.parts.some((p) => p.name.endsWith('-sleepy'));
  const hasOpen = still.parts.some((p) => p.name === 'mouth-open');
  const frame = {
    '--w': still.w,
    '--h': still.h,
    '--below': still.below,
    '--phase': `${-phase}s`,
  } as CSSProperties;
  const draw = (p: StillPart) => {
    const role = roleOf(p, eyes, hasSleepy);
    if (role === 'off') return null;
    // the hello's mouth: open where it can be, a small "o" where it can't
    const hello = role === 'mouth-open' || (role === 'mouth-o' && !hasOpen);
    if ((role === 'mouth-open' || role === 'mouth-o') && !hello) return null;
    const style: CSSProperties = { left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%` };
    const waves = p.arm && p.arm.side === waveArm;
    if (p.arm) {
      style.transformOrigin = `${p.arm.origin[0]}% ${p.arm.origin[1]}%`;
      (style as Record<string, string | number>)['--lift'] = `${p.arm.lift}deg`;
      (style as Record<string, string | number>)['--wig'] = p.arm.side === 'l' ? '-14deg' : '14deg';
    }
    const cls = [
      styles.part,
      role === 'eye' && styles.eye,
      role === 'shut' && styles.shut,
      role === 'mouth' && styles.mouth,
      hello && styles.helloMouth,
      waves && styles.wave,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the stage's own part images, laid as the rig drew them
      <img key={p.name} src={p.src} alt="" className={cls} style={style} data-only={p.only ?? undefined} draggable={false} decoding="async" />
    );
  };
  return (
    <span className={[styles.pal, className].filter(Boolean).join(' ')} style={frame} data-pal={still.slug} aria-hidden="true">
      <span className={styles.hop}>
        {still.parts.filter((p) => p.layer === 'root').map(draw)}
        <span className={styles.body} style={{ transformOrigin: `${still.bodyOrigin[0]}% ${still.bodyOrigin[1]}%` }}>
          {still.parts.filter((p) => p.layer === 'body').map(draw)}
        </span>
      </span>
    </span>
  );
}
