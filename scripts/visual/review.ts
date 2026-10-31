/**
 * The judging step: what changed (or is new) goes to a model with the
 * baseline, the capture, the diff, what the screen should show and what the
 * release meant to change, and comes back as a verdict per capture in
 * `review/verdicts.json`, which the report shows beside each one.
 *
 * Three ways in:
 * - `review --agy` (the usual one): Antigravity's CLI in headless mode, in
 *   batches, each answering a JSON schema (VISUAL_AGY_MODEL, default
 *   gemini-3.8-flash-medium; VISUAL_AGY_BATCH, default 10). Needs `agy` logged in.
 * - `review` writes `review/REVIEW.md`, a self-contained brief any agent with
 *   file access can follow by hand: it reads the images by path and writes the
 *   verdicts file itself.
 * - `review --gemini` calls the Gemini API per capture (GEMINI_API_KEY;
 *   GEMINI_MODEL, default `gemini-flash-latest`).
 *
 * What a release meant to change comes from its commits: a `Visual:` trailer
 * names the screens a commit changes on purpose and why —
 *
 *   Visual: card, card-other: the response bar's note button is shorter
 *   Visual: ios/thread: the composer's ＋ moved inside the capsule
 *   Visual: *: the header's pen line is a shade lighter
 *
 * — so the reviewer can tell an intended change from a regression, and a
 * screen that changed with no trailer naming it stands out.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { BASELINE_DIR, ROOT, git, readJson, writeJson } from './util';
import { SCREENS } from './screens';
import type { Result, RunInfo } from './compare';

export type Verdict = {
  key: string;
  /** ok: looks right; intended: changed as this release meant to; broken: a defect; unsure: a person should look. */
  verdict: 'ok' | 'intended' | 'broken' | 'unsure';
  note: string;
};

type Item = {
  key: string;
  status: Result['status'];
  expect: string;
  /** The `Visual:` trailers naming this capture's screen (each "reason (commit)"). */
  intended: string[];
  baseline: string | null;
  current: string;
  diff: string | null;
};

const RUBRIC = `Judge each screen as a careful QA reviewer of a hand-drawn, paper-like UI
(wobbly pen outlines, organic shapes, cream paper; Traditional Chinese or English copy).
The wobbles are on purpose — never call an outline "uneven". Look for:
- the screen failed: blank, an error page, a spinner or skeleton that never finished, "undefined"/raw keys like "card.share" in place of words
- text clipped, overlapping other text or controls, running off the screen, or truncated where it plainly shouldn't be
- elements overlapping, misaligned against their neighbours, or pushed off screen; a layout meant for another width (a phone layout on a tablet)
- dark mode: text or lines that are hard to read against their background, a light patch left over
- English: Chinese left in an English screen (story content written in Chinese is fine), or the reverse
- anything the "should show" line names that is missing
For a changed screen, compare it with the baseline and say what moved. Call it "intended" only when an
"intended change" line for that screen explains what you see; a change nothing explains is "unsure"
(or "broken" if it is a defect), even when it looks fine.`;

/** The commit the captured platforms' baseline was accepted at (the first one found). */
function baselineCommit(runDir: string): string | undefined {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  return (info?.platforms ?? []).map((p) => readJson<{ commit: string }>(join(BASELINE_DIR, p, 'meta.json'))?.commit).find(Boolean);
}

function commitRange(runDir: string): string | null {
  const since = baselineCommit(runDir);
  const head = readJson<RunInfo>(join(runDir, 'run.json'))?.commit || 'HEAD';
  return since ? `${since}..${head}` : null;
}

/** Every `Visual:` trailer since the baseline, as [targets, reason, commit]. */
export function intendedChanges(runDir: string): { targets: string[]; reason: string; commit: string }[] {
  const range = commitRange(runDir);
  if (!range) return [];
  const log = git('log', '--no-merges', '--format=%h%x09%(trailers:key=Visual,valueonly,separator=%x1f)', range);
  return log
    .split('\n')
    .flatMap((line) => {
      const [commit, values = ''] = line.split('\t');
      return values.split('\x1f').filter(Boolean).map((value) => ({ commit, value }));
    })
    .map(({ commit, value }) => {
      // "card, ios/thread: why" — targets before the first colon; without them, every screen.
      const match = /^\s*([*a-z0-9/-]+(?:\s*,\s*[*a-z0-9/-]+)*)\s*:(.*)$/i.exec(value);
      const targets = match ? match[1].split(',').map((t) => t.trim()).filter(Boolean) : ['*'];
      return { targets, reason: (match ? match[2] : value).trim(), commit };
    });
}

/** Whether a trailer's target (`*`, `card`, `ios/card`, `ios/iphone/card`) names this capture. */
export function names(target: string, key: string): boolean {
  if (target === '*') return true;
  const [platform, device, file] = key.split('/');
  const screen = file.split('@')[0];
  const parts = target.split('/');
  if (parts.length === 1) return parts[0] === screen;
  if (parts.length === 2) return parts[0] === platform && parts[1] === screen;
  return parts[0] === platform && parts[1] === device && parts[2] === screen;
}

function items(runDir: string, results: Result[], all = false): Item[] {
  const byId = new Map(SCREENS.map((s) => [s.id, s.expect]));
  const changes = intendedChanges(runDir);
  return results
    .filter((r) => r.status === 'changed' || r.status === 'new' || (all && r.status === 'unchanged'))
    .map((r) => {
      const id = r.key.split('/').pop()!.split('@')[0];
      return {
        key: r.key,
        status: r.status,
        expect: byId.get(id) ?? '',
        intended: changes.filter((c) => c.targets.some((t) => names(t, r.key))).map((c) => `${c.reason} (${c.commit})`),
        baseline: r.status === 'changed' ? join(BASELINE_DIR, r.key) : null,
        current: join(runDir, r.key),
        diff: r.status === 'changed' && existsSync(join(runDir, '_diff', r.key)) ? join(runDir, '_diff', r.key) : null,
      };
    });
}

function releaseNotes(runDir: string): string {
  const range = commitRange(runDir);
  if (!range) return '(no baseline yet: judge every screen on its own)';
  return git('log', '--no-merges', '--format=- %s', range) || '(no commits since the baseline)';
}

/** One capture's lines for a brief; paths relative to `from` (the repository for agy, absolute for a pasted brief). */
function describe(it: Item, n: number, path: (p: string) => string): string {
  return [
    `### ${n}. \`${it.key}\` (${it.status})`,
    `- Should show: ${it.expect}`,
    ...it.intended.map((reason) => `- Intended change: ${reason}`),
    it.status === 'changed' && !it.intended.length ? '- Intended change: none named for this screen' : null,
    it.baseline ? `- Baseline: ${path(it.baseline)}` : null,
    `- Current: ${path(it.current)}`,
    it.diff ? `- Diff (changed pixels in red): ${path(it.diff)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** `all`: every capture, unchanged ones too (a first look over a new baseline). */
export function writeReviewPack(runDir: string, results: Result[], all = false): string {
  const list = items(runDir, results, all);
  const file = join(runDir, 'review', 'REVIEW.md');
  const rows = list.map((it, i) => describe(it, i + 1, (p) => p)).join('\n\n');
  const md = `# Release screenshot review

Look at each image below (open the files by their absolute paths), then write
\`${join(runDir, 'review', 'verdicts.json')}\`: a JSON array with one entry per
capture, \`{ "key": "<the key>", "verdict": "ok" | "intended" | "broken" | "unsure", "note": "<one or two sentences: what you saw>" }\`.
Use \`intended\` only for a change an "Intended change" line explains, \`broken\` for a defect,
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

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          verdict: { type: 'string', enum: ['ok', 'intended', 'broken', 'unsure'] },
          note: { type: 'string' },
        },
        required: ['key', 'verdict', 'note'],
      },
    },
  },
  required: ['verdicts'],
};

const VERDICTS = ['ok', 'intended', 'broken', 'unsure'];

/**
 * Antigravity's CLI, headless (`agy -p`), one batch at a time, from the
 * repository (its workspace, so it may read the images there). Each batch
 * answers VERDICT_SCHEMA; a capture a batch left out, or a batch that failed,
 * is "unsure" with the reason. Verdicts are written as they come in.
 */
export async function reviewWithAgy(runDir: string, results: Result[], log: (line: string) => void, all = false) {
  const model = process.env.VISUAL_AGY_MODEL || 'gemini-3.8-flash-medium';
  const size = Number(process.env.VISUAL_AGY_BATCH || 10);
  const list = items(runDir, results, all);
  const schema = join(runDir, 'review', 'verdict.schema.json');
  writeJson(schema, VERDICT_SCHEMA);
  const notes = releaseNotes(runDir);
  const verdicts: Verdict[] = [];
  const save = () => writeJson(join(runDir, 'review', 'verdicts.json'), verdicts);
  for (let start = 0; start < list.length; start += size) {
    const batch = list.slice(start, start + size);
    log(`agy (${model}) ${start + 1}–${start + batch.length} of ${list.length}…`);
    const prompt = `You are reviewing release screenshots of Resonance, a story-card app on web, iPhone, iPad, Mac and Android.
Open EVERY image file listed below with your file viewer (paths are relative to the repository root) and look at it before
judging; never judge from the file name. Do not change, create or delete any file, and run no commands.

${RUBRIC}

Release notes since the baseline:
${notes}

${batch.map((it, i) => describe(it, start + i + 1, (p) => relative(ROOT, p))).join('\n\n')}

Answer with exactly one verdict per capture, its "key" being the capture's key in backticks above, and a note of one or two
sentences saying what you saw.`;
    const run = spawnSync(
      'agy',
      ['-p', prompt, '--model', model, '--output-format', 'json', '--json-schema', schema, '--print-timeout', '20m'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    let answered: Verdict[] = [];
    let failure = run.error?.message ?? (run.status !== 0 ? (run.stderr || `agy exited ${run.status}`).trim().slice(-300) : '');
    if (!failure) {
      try {
        const envelope = JSON.parse(run.stdout) as { status?: string; error?: string; structured_output?: { verdicts?: Verdict[] } };
        answered = envelope.structured_output?.verdicts ?? [];
        if (envelope.status !== 'SUCCESS') failure = envelope.error || `agy status ${envelope.status}`;
      } catch {
        failure = 'agy gave no readable answer';
      }
    }
    for (const it of batch) {
      const v = answered.find((a) => a.key === it.key);
      verdicts.push(
        v && VERDICTS.includes(v.verdict)
          ? { key: it.key, verdict: v.verdict, note: String(v.note ?? '') }
          : { key: it.key, verdict: 'unsure', note: failure ? `Not judged: ${failure}` : 'Not judged: agy left this capture out' },
      );
    }
    save();
  }
  save();
  return verdicts;
}

async function askGemini(it: Item, notes: string): Promise<Verdict> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const image = (label: string, path: string) => [
    { text: label },
    { inlineData: { mimeType: 'image/png', data: readFileSync(path).toString('base64') } },
  ];
  const parts = [
    { text: `${RUBRIC}\n\nRelease notes since the baseline:\n${notes}\n\n${describe(it, 1, (p) => relative(ROOT, p))}` },
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
    const verdict = VERDICTS.includes(parsed.verdict) ? parsed.verdict : 'unsure';
    return { key: it.key, verdict, note: String(parsed.note ?? '') };
  } catch {
    return { key: it.key, verdict: 'unsure', note: 'Gemini gave no readable verdict' };
  }
}

export async function reviewWithGemini(runDir: string, results: Result[], log: (line: string) => void, all = false) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY (and optionally GEMINI_MODEL) to review with Gemini');
  const notes = releaseNotes(runDir);
  const verdicts: Verdict[] = [];
  const list = items(runDir, results, all);
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
