/**
 * `visual/baseline/<platform>/meta.json`: what the platform's baseline was accepted from. Its `commit`
 * is where the review starts reading `Visual:` trailers (review.ts `commitRange`): every change since
 * that commit may be on screen.
 *
 * It used to be the latest accept's commit, whatever that accept took. An accept of a few screens
 * (`--only card`) then moved the whole platform's start up to its commit, and every other screen of
 * the platform — still the picture of an older commit — lost the trailers between the two: a change
 * named back then counted as unexplained. So each capture keeps the commit it was accepted at
 * (`captures`), and `commit` is the OLDEST of them: the trailers since then cover every picture in
 * the baseline. `run`, `acceptedAt` and `reason` stay the latest accept's, as before.
 */
import { git } from './util';

export type Provenance = { commit: string; run: string; acceptedAt: string };
export type BaselineMeta = Provenance & { reason: string; captures?: Record<string, Provenance> };

/**
 * The platform's meta after an accept of `accepted` (keys `<platform>/<device>/<shot>.png`), the
 * platform's baseline holding `inBaseline` once the accept is done. Captures accepted before this
 * kind of meta existed take the old top-level commit as theirs. `age` orders commits (a commit
 * time, larger is newer; null when git doesn't know it — a branch since deleted — and then it is
 * left out of the choice unless nothing else is known).
 */
export function nextMeta(
  old: BaselineMeta | null,
  accepted: string[],
  inBaseline: string[],
  latest: Provenance & { reason: string },
  age: (commit: string) => number | null = commitTime,
): BaselineMeta {
  const legacy: Provenance | null = old ? { commit: old.commit, run: old.run, acceptedAt: old.acceptedAt } : null;
  const was = old?.captures ?? {};
  const now = new Set(accepted);
  const captures: Record<string, Provenance> = {};
  for (const key of [...new Set([...inBaseline, ...accepted])].sort()) {
    const p = now.has(key) ? { commit: latest.commit, run: latest.run, acceptedAt: latest.acceptedAt } : (was[key] ?? legacy);
    if (p) captures[key] = p;
  }
  return { commit: oldestCommit(Object.values(captures).map((p) => p.commit), age) ?? latest.commit, run: latest.run, acceptedAt: latest.acceptedAt, reason: latest.reason, captures };
}

/** The oldest of `commits` by `age`; the ones it can't date are used only when none can be. */
export function oldestCommit(commits: string[], age: (commit: string) => number | null = commitTime): string | null {
  const unique = [...new Set(commits.filter(Boolean))];
  if (!unique.length) return null;
  const dated = unique.map((c) => ({ c, t: age(c) })).filter((d): d is { c: string; t: number } => d.t != null);
  if (!dated.length) return unique[0];
  return dated.reduce((a, b) => (b.t < a.t ? b : a)).c;
}

/** A commit's time (seconds), or null when this checkout doesn't have it. */
export function commitTime(commit: string): number | null {
  const t = Number(git('show', '-s', '--format=%ct', `${commit}^{commit}`));
  return Number.isFinite(t) && t > 0 ? t : null;
}
