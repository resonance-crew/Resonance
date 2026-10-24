import styles from './SaveState.module.css';

/** The writer's save state as its bar says it (round 8 §2.1). */
export interface SaveStatus {
  /** 儲存中⋯ · 已儲存 · 修改已暫存 · 未儲存 — never a sentence. */
  label: string;
  /** The tooltip: the word with the last write's time (已儲存 · 14:32). */
  title?: string;
  /** The last write failed (the next pause tries again). */
  failed?: boolean;
}

/**
 * The save state in the writer's bar, after its title (or before the ✓ at the
 * split): muted, one line, the first thing to give way when the row is
 * narrow; a polite live region, so a screen reader hears the change.
 */
export function SaveState({ status, className }: { status: SaveStatus | null; className?: string }) {
  return (
    <span
      className={[styles.state, className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      title={status?.title}
      data-failed={status?.failed || undefined}
    >
      {status?.label}
    </span>
  );
}
