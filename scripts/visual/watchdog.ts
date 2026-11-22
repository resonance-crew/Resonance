/**
 * A run that stops moving ends, rather than holding the machine's devices and ports for hours. The
 * lock's beat (lock.ts) tells a stuck process from a live one, but a run whose event loop is free
 * while it awaits a command that never returns beats on: on 2026-11-22 one sat 2 h 16 min on
 * `simctl bootstatus` with every lock, and the run queued behind it (`--wait`) waited the whole time.
 *
 * So a capture runs under two limits: no progress — no line said (each capture, build and phase says
 * one) — for `VISUAL_STALL_MIN` (default 30: a cold Mac build, the longest silent step, took 17), and
 * the whole run within `VISUAL_RUN_TIMEOUT_MIN` (default 300: a full extended release with its flows
 * takes about two hours). Either one ends the run (`onExpire`): the caller says why, stops its stack,
 * frees its locks and exits 1.
 */
export const STALL_MS = Number(process.env.VISUAL_STALL_MIN || 30) * 60_000;
export const RUN_TIMEOUT_MS = Number(process.env.VISUAL_RUN_TIMEOUT_MIN || 300) * 60_000;

export type Watchdog = {
  /** Something happened: the stall clock starts again. */
  progress: () => void;
  stop: () => void;
};

export function watchdog(
  onExpire: (why: string) => void,
  { stallMs = STALL_MS, totalMs = RUN_TIMEOUT_MS, checkMs = 15_000, now = () => Date.now() }: { stallMs?: number; totalMs?: number; checkMs?: number; now?: () => number } = {},
): Watchdog {
  const started = now();
  let last = started;
  let done = false;
  const minutes = (ms: number) => `${Math.round(ms / 60_000)} min`;
  const timer = setInterval(() => {
    if (done) return;
    const t = now();
    const why =
      t - started > totalMs
        ? `the run passed its ${minutes(totalMs)} limit (VISUAL_RUN_TIMEOUT_MIN)`
        : t - last > stallMs
          ? `nothing moved for ${minutes(t - last)} (VISUAL_STALL_MIN is ${minutes(stallMs)}): a device or a command stopped answering`
          : null;
    if (!why) return;
    done = true;
    clearInterval(timer);
    onExpire(why);
  }, checkMs);
  timer.unref();
  return {
    progress: () => {
      last = now();
    },
    stop: () => {
      done = true;
      clearInterval(timer);
    },
  };
}
