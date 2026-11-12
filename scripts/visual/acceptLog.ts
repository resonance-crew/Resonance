/**
 * What every `accept` leaves behind in git. The baselines are git-ignored (visual/, this machine's
 * own), so the only record that a run became the baseline used to be its platform's meta.json —
 * which keeps the latest accept and never says on whose word. A baseline changes only on the
 * owner's OK (CLAUDE.md, Verification), so `accept` now refuses to run without `--reason` and
 * appends one row per accept to docs/visual-accept-log.md: when, the run and the commit it
 * captured, the platforms, the screens named with `--only`, how many captures, and the reason.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './util';

export const ACCEPT_LOG = join(ROOT, 'docs', 'visual-accept-log.md');

export const ACCEPT_LOG_HEADER = `# Visual baseline accepts

Every \`npm run visual -- accept\` appends a row here (\`scripts/visual/acceptLog.ts\`): when, the run
and the commit it captured, the platforms, the screens named with \`--only\` (*all* when none was),
how many captures went into the baseline, and the reason — the owner's words, or what the accept
rests on. The baselines themselves are git-ignored (\`visual/\`, this machine's own); this file is
what says on whose word they changed. Commit the new row with the accept
(\`git commit -- docs/visual-accept-log.md\`).

| Accepted (UTC) | Run | Commit | Platforms | --only | Captures | Reason |
| --- | --- | --- | --- | --- | --- | --- |
`;

export const REASON_REQUIRED =
  'accept needs --reason "<the owner\'s words, or what the accept rests on>": a baseline changes only on the owner\'s OK, ' +
  'and docs/visual-accept-log.md records why (scripts/visual/README.md, "Accepting"). Nothing was accepted.';

/** The `--reason` given, trimmed — or null when there is none, it is blank, or the next word is another flag. */
export function acceptReason(args: string[]): string | null {
  const i = args.indexOf('--reason');
  if (i < 0) return null;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) return null;
  const reason = value.trim();
  return reason ? reason : null;
}

export type AcceptEntry = {
  at: Date;
  run: string;
  commit: string;
  dirty: boolean;
  /** The captures accepted, `<platform>/<device>/<shot>.png`. */
  keys: string[];
  /** What `--only` named; empty for the whole run. */
  only: string[];
  reason: string;
};

/** One table cell: one line, no column break. */
const cell = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|').trim();

/** The platforms a set of capture keys covers, in the order they first appear. */
export function platformsOf(keys: string[]): string[] {
  return [...new Set(keys.map((k) => k.split('/')[0]))];
}

export function acceptRow(entry: AcceptEntry): string {
  const at = entry.at.toISOString().replace(/\.\d+Z$/, 'Z');
  const commit = entry.commit.slice(0, 8) + (entry.dirty ? ' (dirty)' : '');
  const only = entry.only.length ? entry.only.join(', ') : 'all';
  const cells = [at, entry.run, commit, platformsOf(entry.keys).join(', '), only, String(entry.keys.length), entry.reason];
  return `| ${cells.map(cell).join(' | ')} |\n`;
}

/** Appends the accept's row, writing the file's head first when there is no file yet. */
export function appendAcceptLog(entry: AcceptEntry, file = ACCEPT_LOG): string {
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, ACCEPT_LOG_HEADER);
  }
  const row = acceptRow(entry);
  // A file edited by hand may have lost its last line break: the row must still start a line of its own.
  appendFileSync(file, readFileSync(file, 'utf8').endsWith('\n') ? row : `\n${row}`);
  return row;
}
