/**
 * The narration (SPEC §9): one item per scene, an h2 and one sentence, each at its scene's place on the track —
 * visually hidden (a screen reader's, and the hash's: `#answer` lands on its scene). Round 4 (the owner: 「使用者可以
 * 不看動畫，直接往下滾動，然後會有一些說明文字和一些場景…我希望把這個拿掉」): the picture book — these lines shown, each
 * with a plate of its scene — is gone; the page is the film, and nothing else tells the story. Server component.
 */
import type { CSSProperties } from 'react';
import { copyFor } from './copy';
import { SCENES } from './script/timeline';
import styles from './film.module.css';

export function Narration({ locale }: { locale: string }) {
  const c = copyFor(locale);
  return (
    <ol className={styles.beats}>
      {SCENES.map((sc, i) => (
        <li key={sc.hash} id={sc.hash} className={styles.beat} style={{ '--y': sc.y0 } as CSSProperties}>
          <h2>{c.scenes[i].name}</h2>
          <p>{c.scenes[i].line}</p>
        </li>
      ))}
    </ol>
  );
}
