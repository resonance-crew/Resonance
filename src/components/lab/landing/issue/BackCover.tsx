import { useTranslations } from 'next-intl';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Link } from '@/i18n/navigation';
import { makePrng } from '@/lib/design/prng';
import { copyFor } from './copy';
import { RestToggle } from './RestToggle';
import { STILLS } from './stills';
import b from './back.module.css';

const LINKS = [
  ['about', '/about'],
  ['pals', '/paper-pals'],
  ['contact', '/support'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
] as const;

/** Pinpricks in the night paper (seeded: the same sky on the server and the client). */
const STARS = (() => {
  const rnd = makePrng(4091);
  return Array.from({ length: 70 }, () => ({
    x: rnd() * 1440,
    y: 40 + rnd() * 560,
    r: 0.6 + rnd() * rnd() * 1.6,
    o: 0.35 + rnd() * 0.55,
    tw: rnd() < 0.18,
  }));
})();

/**
 * 封底 The back cover: the footer as a night band — a wave at its top, pinprick stars, 悄悄 asleep by the logo — with
 * the tagline, the badges and the stores' trademark line, the links, © and the pals' rest switch.
 */
export function BackCover({ locale }: { locale: string }) {
  const t = copyFor(locale);
  const f = useTranslations('footer');
  return (
    <footer className={b.back} data-night="">
      <SectionEdge topColor="var(--color-cream)" seed={233} height={90} amplitude={0.14} steps={14} />
      <svg className={b.stars} viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {STARS.map((st, i) => (
          <circle key={i} cx={st.x.toFixed(1)} cy={st.y.toFixed(1)} r={st.r.toFixed(2)} className={st.tw ? b.twinkle : undefined} style={{ opacity: st.o, animationDelay: `${(i % 7) * 0.8}s` }} />
        ))}
      </svg>
      <div className={b.backInner}>
        <div className={b.brandRow}>
          <span className={b.hush} aria-hidden="true">
            <PaperPalStill still={STILLS.night} eyes="sleepy" phase={0.7} />
          </span>
          <span className={b.brand}>
            <ResonanceIcon size={30} />
            <span className={b.brandName}>Resonance</span>
          </span>
        </div>
        <p className={b.tagline}>{f('tagline')}</p>
        <Link href="/home" className={b.night}>
          {t.back.night}
          <span aria-hidden="true"> →</span>
        </Link>
        <div className={b.download}>
          <GetTheApp qr={false} size="sm" tone="ink" />
          <p className={b.trademarks}>{f('trademarks')}</p>
        </div>
        <div className={b.links}>
          {LINKS.map(([k, href]) => (
            <Link key={k} href={href} className={b.link}>
              {f(k)}
            </Link>
          ))}
        </div>
        <div className={b.foot}>
          <p className={b.copyright}>{f('copyright')}</p>
          <RestToggle locale={locale} className={b.rest} />
        </div>
      </div>
    </footer>
  );
}
