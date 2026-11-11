/**
 * The first screen's words (SPEC §6): the h1 in cream over the blue-hour sky (zh 「用故事」 then 「回應故事」, 回應 with
 * the pen wave; en "Answer stories with stories"), and the one supporting line. The LCP; nothing covers it. No store
 * badges here (the owner, round 3: 「首頁一進來，不要顯示這個 App Store 和 Google Play 的下載…畫面已經比較擁擠了」 —
 * they wait at the page's end, #download). In the first change it flies away as a flat of depth 0.6 (its words passing
 * under the header's pen line: the roof), and is then marked `data-gone`: its words visually hidden (still read).
 */
import { Emphasis } from '@/components/atoms/Emphasis/Emphasis';
import { INK_STRONG } from '@/lib/design/strokes';
import { copyFor } from './copy';
import styles from './film.module.css';

const ACCENT = 'oklch(84% 0.10 62)';

function Line({ part }: { part: { before: string; accent: string; after: string } }) {
  if (!part.before && !part.accent && !part.after) return null;
  return (
    <span className={styles.h1Line}>
      {part.before}
      {part.accent && (
        <Emphasis color={ACCENT} strokeWidth={INK_STRONG} seed={11}>
          {part.accent}
        </Emphasis>
      )}
      {part.after}
    </span>
  );
}

export function Hero({ locale }: { locale: string }) {
  const c = copyFor(locale).hero;
  // the roof: in the film the hero flies up as a flat and its words pass under the header's pen line (a still mask
  // over the stage's top; the hero moves under it)
  return (
    <div className={styles.heroRoof}>
      <div className={styles.hero} data-hero="">
        <h1 className={styles.h1} lang={locale}>
          <Line part={c.lineA} /> <Line part={c.lineB} />
        </h1>
        <p className={styles.sub} lang={locale}>
          {c.sub}
        </p>
      </div>
    </div>
  );
}
