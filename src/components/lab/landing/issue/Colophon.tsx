import { useTranslations } from 'next-intl';
import { PaperPalStill } from '@/components/molecules/PaperPalStill/PaperPalStill';
import { Link } from '@/i18n/navigation';
import type { PalSlug } from '@/lib/mascots/pals/still';
import { copyFor } from './copy';
import { InkTitle, PenRule } from './marks';
import { STILLS } from './stills';
import s from './issue.module.css';
import b from './back.module.css';

/** The staff, in the order of the page: who works where. */
const STAFF: { slug: PalSlug; wave: 'l' | 'r' }[] = [
  { slug: 'tuck', wave: 'l' },
  { slug: 'dot', wave: 'l' },
  { slug: 'tag', wave: 'r' },
  { slug: 'card', wave: 'r' },
  { slug: 'night', wave: 'r' },
];

/**
 * 本期編輯部: every puppet on the page credited with its job, which explains the page after the fact — each one a still
 * (it says hello under the pointer), its name, its role and its line; and a way to /paper-pals.
 */
export function Colophon({ locale }: { locale: string }) {
  const t = copyFor(locale);
  const pals = useTranslations('pals');
  return (
    <section className={b.staff} aria-labelledby="staff-title">
      <div className={s.sheet}>
        <span className={s.folio} aria-hidden="true">
          05
        </span>
        <div className={b.staffHead}>
          <InkTitle id="staff-title" text={t.staff.title} className={b.staffTitle} />
          <Link href="/paper-pals" className={s.textLink}>
            {t.staff.meet}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
        <PenRule seed={1409} className={b.staffRule} />
        <ul className={b.slots}>
          {STAFF.map(({ slug, wave }, i) => (
            <li key={slug} className={b.slot} data-hello-hover="">
              <span className={b.slotStill} aria-hidden="true">
                <PaperPalStill still={STILLS[slug]} waveArm={wave} phase={i * 1.3} eyes={slug === 'night' ? 'sleepy' : 'open'} />
              </span>
              <span className={b.slotName}>{pals(`${slug}.name`)}</span>
              <span className={b.slotRole}>{t.staff.roles[slug]}</span>
              <span className={b.slotLine}>{pals(`${slug}.line`)}</span>
            </li>
          ))}
        </ul>
        <PenRule seed={1433} className={b.staffRule} />
      </div>
    </section>
  );
}
