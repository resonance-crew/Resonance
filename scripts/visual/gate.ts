/**
 * Whether a run passes, said so a script can stop on it. The report is for a person; this is for
 * an agent or a release step: `summary.json` in the run's folder, one line on the console
 * (`Visual PASS …` / `Visual FAIL …`, the last thing `capture`, `compare` and `review` print), and
 * the exit code — 1 when anything below is a problem.
 *
 * Problems (they fail the run):
 *   broken       the review judged a capture broken
 *   unsettled    a capture never held still, even after a second look (secondLook.ts)
 *   unexplained  a capture changed and no `Visual:` trailer since the baseline names its screen
 *   flow         a Maestro flow failed
 *   check        a web check raised to `fail` (webChecks.ts) found something
 * Warnings (said, never failing): a capture taken again because its first look was early, a
 * baseline the run didn't take (missing), a web check still at `warn`.
 *
 * A changed capture a trailer names is neither: it waits for the owner's OK (`accept --reason`).
 */
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Result, RunInfo } from './compare';
import { intendedChanges, names, readVerdicts, type Verdict } from './review';
import { ROOT, readJson, writeJson } from './util';
import { checksPath, type Finding } from './webChecks';

export type ProblemKind = 'broken' | 'unsettled' | 'unexplained' | 'flow' | 'check';
export type WarningKind = 'retaken' | 'missing' | 'check';
export type Note<K> = { kind: K; key: string; detail: string };

export type Summary = {
  run: string;
  pass: boolean;
  counts: { changed: number; new: number; missing: number; unchanged: number; problems: number; warnings: number; awaiting: number };
  problems: Note<ProblemKind>[];
  warnings: Note<WarningKind>[];
  /** Changed captures a trailer names: the owner's to look at, then `accept --reason`. */
  awaiting: string[];
  report: string;
};

export type GateInput = {
  info: RunInfo | null;
  results: Result[];
  verdicts: Map<string, Verdict>;
  /** The `Visual:` trailers naming a capture's screen. */
  intendedFor: (key: string) => string[];
  /** A capture's web findings. */
  findingsFor: (key: string) => Finding[];
  report: string;
};

export function judge({ info, results, verdicts, intendedFor, findingsFor, report }: GateInput): Summary {
  const problems: Note<ProblemKind>[] = [];
  const warnings: Note<WarningKind>[] = [];
  const awaiting: string[] = [];
  for (const r of results) {
    const verdict = verdicts.get(r.key);
    if (verdict?.verdict === 'broken') problems.push({ kind: 'broken', key: r.key, detail: verdict.note || 'the review judged it broken' });
    if (r.status === 'changed') {
      if (intendedFor(r.key).length) awaiting.push(r.key);
      else problems.push({ kind: 'unexplained', key: r.key, detail: 'changed, and no Visual: trailer since the baseline names this screen' });
    }
    if (r.status === 'missing') warnings.push({ kind: 'missing', key: r.key, detail: 'in the baseline, not taken by this run' });
    for (const f of r.status === 'missing' ? [] : findingsFor(r.key)) {
      const note = { kind: 'check' as const, key: r.key, detail: `${f.check}: ${f.detail}` };
      if (f.level === 'fail') problems.push(note);
      else warnings.push(note);
    }
  }
  for (const key of info?.unsettled ?? []) problems.push({ kind: 'unsettled', key, detail: 'never held still, even after a second look' });
  for (const key of info?.retaken ?? []) {
    if (!(info?.unsettled ?? []).includes(key)) warnings.push({ kind: 'retaken', key, detail: 'the first look was early (taken again; the later one is kept)' });
  }
  for (const flow of info?.flowsFailed ?? []) problems.push({ kind: 'flow', key: flow, detail: 'the Maestro flow failed (its report is in _flows/)' });
  const count = (s: string) => results.filter((r) => r.status === s).length;
  return {
    run: info?.id ?? '',
    pass: problems.length === 0,
    counts: {
      changed: count('changed'),
      new: count('new'),
      missing: count('missing'),
      unchanged: count('unchanged'),
      problems: problems.length,
      warnings: warnings.length,
      awaiting: awaiting.length,
    },
    problems,
    warnings,
    awaiting,
    report,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one line: verdict, why, what changed, where the rest is. */
export function summaryLine(s: Summary, summaryFile: string): string {
  const kinds = new Map<string, number>();
  for (const p of s.problems) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  const why = s.pass
    ? 'nothing broken, unsettled or unexplained'
    : [...kinds].map(([kind, n]) => `${n} ${kind}`).join(', ');
  const c = s.counts;
  const owner = c.awaiting ? ` · ${plural(c.awaiting, 'change')} for the owner to look at` : '';
  const warn = c.warnings ? ` · ${plural(c.warnings, 'warning')}` : '';
  return `Visual ${s.pass ? 'PASS' : 'FAIL'} ${s.run}: ${why}${owner} · ${c.changed} changed, ${c.new} new, ${c.missing} missing, ${c.unchanged} unchanged${warn} → ${summaryFile}`;
}

/** Judges a run from its folder (results, run.json, verdicts, trailers, findings), writes summary.json and returns it. */
export function judgeRun(runDir: string, results: Result[]): { summary: Summary; file: string } {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const changes = intendedChanges(runDir);
  const summary = judge({
    info,
    results,
    verdicts: readVerdicts(runDir),
    intendedFor: (key) => changes.filter((c) => c.targets.some((t) => names(t, key))).map((c) => `${c.reason} (${c.commit})`),
    findingsFor: (key) => {
      const file = checksPath(join(runDir, key));
      return existsSync(file) ? (readJson<Finding[]>(file) ?? []) : [];
    },
    report: relative(ROOT, join(runDir, 'index.html')),
  });
  const file = join(runDir, 'summary.json');
  writeJson(file, summary);
  return { summary, file: relative(ROOT, file) };
}

/** What a script reads on the console: the problems (at most `max`), then the one line, which is last. */
export function gateLines(summary: Summary, file: string, max = 10): string[] {
  const lines = summary.problems.slice(0, max).map((p) => `  ✗ ${p.kind} ${p.key}: ${p.detail}`);
  if (summary.problems.length > max) lines.push(`  … and ${summary.problems.length - max} more in ${file}`);
  return [...lines, summaryLine(summary, file)];
}
