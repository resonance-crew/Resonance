import { Fragment } from 'react';
import styles from './oneday.module.css';

/** Where a line may break: after a Chinese comma, enumeration comma or dash, or after a Latin comma or dash and its space. */
const BREAK = /(——|，|、)|([,—])\s+/gu;

/**
 * A line set in its clauses, each comma or dash kept with the clause before it, each clause holding together: a line
 * too long for one row breaks between clauses, never inside one (讀到觸動你的故事，｜不必按讚——｜寫一張…).
 */
export function Clauses({ text }: { text: string }) {
  const parts: { text: string; space: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(BREAK)) {
    const end = (m.index ?? 0) + (m[1] ?? m[2] ?? '').length;
    parts.push({ text: text.slice(last, end), space: !!m[2] });
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push({ text: text.slice(last), space: false });
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          <span className={styles.clause}>{p.text}</span>
          {p.space && ' '}
        </Fragment>
      ))}
    </>
  );
}
