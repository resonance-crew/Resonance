/**
 * The judging step: what changed (or is new) goes to a model with the
 * baseline, the capture, the diff and what the screen should show, and comes
 * back as a verdict per capture in `review/verdicts.json`, which the report
 * shows beside each one.
 *
 * Two ways in:
 * - `review` writes `review/REVIEW.md`, a self-contained brief any agent with
 *   file access can follow (Antigravity's Gemini, Claude, …): it reads the
 *   images by path and writes the verdicts file itself.
 * - `review --gemini` calls the Gemini API per capture (GEMINI_API_KEY;
 *   GEMINI_MODEL, default `gemini-flash-latest`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BASELINE_DIR, git, readJson, writeJson } from './util';
import { SCREENS } from './screens';
import type { Result, RunInfo } from './compare';

export type Verdict = {
  key: string;
  /** ok: looks right; intended: changed as this release meant to; broken: a defect; unsure: a person should look. */
  verdict: 'ok' | 'intended' | 'broken' | 'unsure';
  note: string;
};

type Item = { key: string; status: Result['status']; expect: string; baseline: string | null; current: string; diff: string | null };

const RUBRIC = `Judge each screen as a careful QA reviewer of a hand-drawn, paper-like UI
(wobbly pen outlines, organic shapes, cream paper; Traditional Chinese or English copy).
The wobbles are on purpose — never call an outline "uneven". Look for:
- the screen failed: blank, an error page, a spinner or skeleton that never finished, "undefined"/raw keys like "card.share" in place of words
- text clipped, overlapping other text or controls, running off the screen, or truncated where it plainly shouldn't be
- elements overlapping, misaligned against their neighbours, or pushed off screen; a layout meant for another width (a phone layout on a tablet)
- dark mode: text or lines that are hard to read against their background, a light patch left over
- English: Chinese left in an English screen (story content written in Chinese is fine), or the reverse
- anything the "should show" line names that is missing
For a changed screen, compare with the baseline: say what moved, and whether the release notes explain it.`;

function items(runDir: string, results: Result[]): Item[] {
  const byId = new Map(SCREENS.map((s) => [s.id, s.expect]));
  return results
    .filter((r) => r.status === 'changed' || r.status === 'new')
    .map((r) => {
      const id = r.key.split('/').pop()!.split('@')[0];
      return {
        key: r.key,
        status: r.status,
        expect: byId.get(id) ?? '',
        baseline: r.status === 'changed' ? join(BASELINE_DIR, r.key) : null,
        current: join(runDir, r.key),
        diff: r.status === 'changed' && existsSync(join(runDir, '_diff', r.key)) ? join(runDir, '_diff', r.key) : null,
      };
    });
}

function releaseNotes(runDir: string): string {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  const platforms = info?.platforms ?? [];
  const since = platforms
    .map((p) => readJson<{ commit: string }>(join(BASELINE_DIR, p, 'meta.json'))?.commit)
    .find(Boolean);
  if (!since) return '(no baseline yet: judge every screen on its own)';
  return git('log', '--no-merges', '--format=- %s', `${since}..${info?.commit || 'HEAD'}`) || '(no commits since the baseline)';
}

export function writeReviewPack(runDir: string, results: Result[]): string {
  const list = items(runDir, results);
  const file = join(runDir, 'review', 'REVIEW.md');
  const rows = list
    .map((it, i) =>
      [
        `### ${i + 1}. \`${it.key}\` (${it.status})`,
        `- Should show: ${it.expect}`,
        it.baseline ? `- Baseline: ${it.baseline}` : null,
        `- Current: ${it.current}`,
        it.diff ? `- Diff (changed pixels in red): ${it.diff}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  const md = `# Release screenshot review

Look at each image below (open the files by their absolute paths), then write
\`${join(runDir, 'review', 'verdicts.json')}\`: a JSON array with one entry per
capture, \`{ "key": "<the key>", "verdict": "ok" | "intended" | "broken" | "unsure", "note": "<one or two sentences: what you saw>" }\`.
Use \`intended\` only for a change the release notes explain, \`broken\` for a defect,
\`unsure\` when a person should look. Write nothing else and change no other file.

## What to look for

${RUBRIC}

## Release notes since the baseline

${releaseNotes(runDir)}

## Captures (${list.length})

${rows || '_Nothing changed and nothing is new._'}
`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, md);
  return file;
}

async function askGemini(it: Item, notes: string): Promise<Verdict> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const image = (label: string, path: string) => [
    { text: label },
    { inlineData: { mimeType: 'image/png', data: readFileSync(path).toString('base64') } },
  ];
  const parts = [
    { text: `${RUBRIC}\n\nRelease notes since the baseline:\n${notes}\n\nScreen \`${it.key}\` (${it.status}). Should show: ${it.expect}` },
    ...(it.baseline ? image('Baseline:', it.baseline) : []),
    ...image('Current:', it.current),
    ...(it.diff ? image('Diff (changed pixels in red):', it.diff) : []),
    { text: 'Answer as JSON: {"verdict": "ok" | "intended" | "broken" | "unsure", "note": "<one or two sentences>"}' },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key! },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) return { key: it.key, verdict: 'unsure', note: `Gemini answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  try {
    const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '') as Omit<Verdict, 'key'>;
    const verdict = ['ok', 'intended', 'broken', 'unsure'].includes(parsed.verdict) ? parsed.verdict : 'unsure';
    return { key: it.key, verdict, note: String(parsed.note ?? '') };
  } catch {
    return { key: it.key, verdict: 'unsure', note: 'Gemini gave no readable verdict' };
  }
}

export async function reviewWithGemini(runDir: string, results: Result[], log: (line: string) => void) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY (and optionally GEMINI_MODEL) to review with Gemini');
  const notes = releaseNotes(runDir);
  const verdicts: Verdict[] = [];
  const list = items(runDir, results);
  for (const [i, it] of list.entries()) {
    log(`Gemini ${i + 1}/${list.length}: ${it.key}`);
    verdicts.push(await askGemini(it, notes));
  }
  writeJson(join(runDir, 'review', 'verdicts.json'), verdicts);
  return verdicts;
}

export function readVerdicts(runDir: string): Map<string, Verdict> {
  const list = readJson<Verdict[]>(join(runDir, 'review', 'verdicts.json')) ?? [];
  return new Map(list.map((v) => [v.key, v]));
}
