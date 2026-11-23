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
import { spawn, type ChildProcess } from 'node:child_process';
import { oldestCommit } from './baselineMeta';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { runBaseline } from './baselines';
import { GLANCE_DIR, ROOT, git, listPngs, readJson, writeJson } from './util';
import { SCREENS } from './screens';
import type { Result, RunInfo } from './compare';

export type Verdict = {
  key: string;
  /** ok: looks right; intended: changed as this release meant to; broken: a defect; unsure: a person should look. */
  verdict: 'ok' | 'intended' | 'broken' | 'unsure';
  note: string;
};

export type Item = {
  key: string;
  /** `glance`: a capture only looked at, with no baseline (the landing film's stills, in the run's `_glance/`). */
  status: Result['status'] | 'glance';
  expect: string;
  /** The `Visual:` trailers naming this capture's screen (each "reason (commit)"). */
  intended: string[];
  baseline: string | null;
  current: string;
  diff: string | null;
  /** The largest areas that changed, in words. */
  areas: string[];
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

/**
 * Where the captured platforms' baseline starts: the oldest of their commits (baselineMeta.ts), so the trailers
 * read cover every picture any of them holds (it was the first platform's, which could be the newest).
 */
function baselineCommit(runDir: string): string | undefined {
  const info = readJson<RunInfo>(join(runDir, 'run.json'));
  // The run's own baseline (baselines.ts): a round's starts at its own accepts, never at another branch's.
  const commits = (info?.platforms ?? []).map((p) => readJson<{ commit: string }>(join(runBaseline(runDir), p, 'meta.json'))?.commit ?? '');
  return oldestCommit(commits) ?? undefined;
}

/**
 * The commits a run's trailers come from: since the baseline's, up to HEAD while HEAD descends from
 * the run's commit — so a trailer committed after the run (the work it captured, committed with its
 * `Visual:` line; or an empty commit naming a change already made) explains it on `compare --run` —
 * else up to the run's own commit.
 */
function commitRange(runDir: string): string | null {
  const since = baselineCommit(runDir);
  if (!since) return null;
  const ran = readJson<RunInfo>(join(runDir, 'run.json'))?.commit || 'HEAD';
  const own = git('rev-parse', ran);
  const head = own && git('merge-base', ran, 'HEAD') === own ? 'HEAD' : ran;
  return `${since}..${head}`;
}

/**
 * Every `Visual:` line since the baseline, as [targets, reason, commit] — read from the whole message,
 * not only git's trailer block: the house writes `Visual:` in a paragraph of its own above
 * `Co-Authored-By`, which git's trailer parsing (the last paragraph only) never saw.
 */
export function intendedChanges(runDir: string): { targets: string[]; reason: string; commit: string }[] {
  const range = commitRange(runDir);
  if (!range) return [];
  return visualLines(git('log', '--no-merges', '--format=%h%x1f%B%x1e', range)).map(({ commit, value }) => ({ ...readTrailer(value), commit }));
}

/** The `Visual:` lines of `git log --format=%h%x1f%B%x1e` output, each with its commit. */
export function visualLines(log: string): { commit: string; value: string }[] {
  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [commit, body = ''] = entry.split('\x1f');
      return [...body.matchAll(/^Visual:[ \t]*(.+)$/gim)].map((m) => ({ commit: commit.trim(), value: m[1].trim() }));
    });
}

const SCREEN_IDS = new Set(SCREENS.map((s) => s.id));
const PLATFORM_IDS = new Set(['web', 'ios', 'android', 'mac']);
/** `*`, a screen id, `<platform>/<screen>` or `<platform>/<device>/<screen>` of a real screen. */
const isTarget = (t: string) => {
  if (t === '*') return true;
  const parts = t.split('/');
  return parts.length <= 3 && SCREEN_IDS.has(parts[parts.length - 1]) && (parts.length === 1 || PLATFORM_IDS.has(parts[0]));
};

/**
 * One `Visual:` value: "card, ios/thread: why" — the targets before the first colon. A line written
 * more loosely ("landing (desktop web): why", "landing (web) — why") names the screens among its first
 * words, before the colon or the dash. `none` (`Visual: none — checked on a phone in Chrome`), or a
 * line naming no screen at all, names none: read as "every screen" it would explain any change since
 * the baseline. Every screen is `*`, written out.
 */
export function readTrailer(value: string): { targets: string[]; reason: string } {
  const text = value.trim();
  if (/^none\b/i.test(text)) return { targets: [], reason: text };
  const strict = /^([*a-z0-9/-]+(?:\s*,\s*[*a-z0-9/-]+)*)\s*:(.*)$/i.exec(text);
  if (strict) {
    const targets = strict[1].split(',').map((t) => t.trim()).filter(Boolean);
    if (targets.every(isTarget)) return { targets, reason: strict[2].trim() };
  }
  const head = /^(.*?)(?::|\s[—–-]\s)/.exec(text)?.[1] ?? '';
  const targets = head.split(/[\s,()]+/).filter(isTarget);
  return { targets, reason: text.slice(head.length).replace(/^\s*(?::|[—–-])\s*/, '').trim() || text };
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
    .map((r): Item => {
      const id = r.key.split('/').pop()!.split('@')[0];
      return {
        key: r.key,
        status: r.status,
        expect: byId.get(id) ?? '',
        intended: changes.filter((c) => c.targets.some((t) => names(t, r.key))).map((c) => `${c.reason} (${c.commit})`),
        baseline: r.status === 'changed' ? join(runBaseline(runDir), r.key) : null,
        current: join(runDir, r.key),
        diff: r.status === 'changed' && existsSync(join(runDir, '_diff', r.key)) ? join(runDir, '_diff', r.key) : null,
        areas: (r.areas ?? []).slice(0, 5).map((a) => `${a.width}×${a.height} px at (${a.x}, ${a.y})`),
      };
    })
    .concat(
      listPngs(join(runDir, GLANCE_DIR)).map((key): Item => ({
        key,
        status: 'glance',
        expect: byId.get(key.split('/').pop()!.split('@')[0]) ?? '',
        intended: [],
        baseline: null,
        current: join(runDir, GLANCE_DIR, key),
        diff: null,
        areas: [],
      })),
    );
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
    it.status === 'glance' ? '- No baseline: judge it on its own, "ok" or "broken" (a moment of the landing film, held still)' : null,
    it.baseline ? `- Baseline: ${path(it.baseline)}` : null,
    `- Current: ${path(it.current)}`,
    it.diff ? `- Diff (changed pixels in red and boxed; pale yellow only moved a pixel or two, ignore it): ${path(it.diff)}` : null,
    it.areas.length ? `- Where it changed (capture pixels): ${it.areas.join('; ')}` : null,
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

/** What one `agy` call came back with. */
export type AgyAnswer = { status: number | null; stdout: string; stderr: string; error?: string };
/** Runs `agy` with these arguments from the repository; the review's one way out (a test gives its own). */
export type AgyRunner = (args: string[]) => Promise<AgyAnswer>;

/** The `agy` calls under way: stopped when the run ends before them (a phase that failed, the watchdog), never left behind. */
const calls = new Set<ChildProcess>();
let stopsCalls = false;

/** `agy` itself, without holding up the run: its output read as it comes, never past 64 MB. */
export const runAgy: AgyRunner = (args) =>
  new Promise((resolve) => {
    const child = spawn('agy', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    calls.add(child);
    child.once('exit', () => calls.delete(child));
    if (!stopsCalls) {
      stopsCalls = true;
      process.once('exit', () => calls.forEach((c) => c.kill('SIGTERM')));
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    const keep = (into: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 64 << 20) into.push(chunk);
    };
    child.stdout!.on('data', keep(out));
    child.stderr!.on('data', keep(err));
    child.on('error', (error) => resolve({ status: null, stdout: '', stderr: '', error: error.message }));
    child.on('close', (status) => resolve({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
  });

/** How many `agy` batches run at once (`VISUAL_AGY_PARALLEL`, default 3; 1 is one after the other, as before). */
export function agyParallel(): number {
  const set = Number(process.env.VISUAL_AGY_PARALLEL);
  return Number.isFinite(set) && set >= 1 ? Math.floor(set) : 3;
}

/** A failure that says the service is turning calls away (rate, quota): then the batches go one at a time. */
export const RATE_LIMITED = /\b429\b|rate.?limit|quota|resource.?exhausted|too many requests/i;

/** What a batch's call came to: the verdicts it gave, or why it gave none. */
function readAnswer(run: AgyAnswer): { answered: Verdict[]; failure: string } {
  let failure = run.error ?? (run.status !== 0 ? (run.stderr || `agy exited ${run.status}`).trim().slice(-300) : '');
  let answered: Verdict[] = [];
  if (!failure) {
    try {
      const envelope = JSON.parse(run.stdout) as { status?: string; error?: string; structured_output?: { verdicts?: Verdict[] } };
      answered = envelope.structured_output?.verdicts ?? [];
      if (envelope.status !== 'SUCCESS') failure = envelope.error || `agy status ${envelope.status}`;
    } catch {
      failure = 'agy gave no readable answer';
    }
  }
  return { answered, failure };
}

export type AgyReviewer = {
  /** Queues these captures (in batches); answers once they are all judged. */
  add: (items: Item[]) => Promise<void>;
  /** Every verdict so far, in the order the captures were added. */
  verdicts: () => Verdict[];
  /** Waits for everything queued. */
  done: () => Promise<Verdict[]>;
};

export type AgyOptions = { runner?: AgyRunner; limit?: number; size?: number; model?: string };

/**
 * Antigravity's CLI, headless (`agy -p`), from the repository (its workspace, so it may read the images there), in
 * batches (VISUAL_AGY_BATCH, default 10), several at once (`agyParallel`, default 3): a release's 116 changed captures
 * took 12 batches one after the other, 34 min (run 20261123-073642). Each batch answers VERDICT_SCHEMA; a capture a
 * batch left out, or a batch that failed, is "unsure" with the reason. A batch turned away for its rate or quota
 * (`RATE_LIMITED`) is tried once more, and from then on the batches go one at a time. Verdicts are written to
 * `review/verdicts.json` as they come in. Captures can be added while others are being judged (`add`): the capture
 * run hands each phase's captures over as the phase ends, so the review goes on beside the next phase.
 */
export function agyReviewer(runDir: string, log: (line: string) => void, options: AgyOptions = {}): AgyReviewer {
  const runner = options.runner ?? runAgy;
  const size = options.size ?? Number(process.env.VISUAL_AGY_BATCH || 10);
  const model = options.model ?? (process.env.VISUAL_AGY_MODEL || 'gemini-3.8-flash-medium');
  let width = options.limit ?? agyParallel();
  const schema = join(runDir, 'review', 'verdict.schema.json');
  writeJson(schema, VERDICT_SCHEMA);
  const notes = releaseNotes(runDir);
  const order: string[] = [];
  const byKey = new Map<string, Verdict>();
  const verdicts = () => order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const save = () => writeJson(join(runDir, 'review', 'verdicts.json'), verdicts());
  type Batch = { items: Item[]; first: number; retried: boolean; done: () => void };
  const queue: Batch[] = [];
  let running = 0;
  let numbered = 0;
  const all: Promise<void>[] = [];

  /** Judges a batch; answers false when it went back on the queue (turned away, to be tried once more). */
  const judge = async (batch: Batch): Promise<boolean> => {
    const { items: list, first } = batch;
    log(`agy (${model}) ${first}–${first + list.length - 1} of ${numbered}…`);
    const prompt = `You are reviewing release screenshots of Resonance, a story-card app on web, iPhone, iPad, Mac and Android.
Open EVERY image file listed below with your file viewer (paths are relative to the repository root) and look at it before
judging; never judge from the file name. Do not change, create or delete any file, and run no commands.

${RUBRIC}

Release notes since the baseline:
${notes}

${list.map((it, i) => describe(it, first + i, (p) => relative(ROOT, p))).join('\n\n')}

Answer with exactly one verdict per capture, its "key" being the capture's key in backticks above, and a note of one or two
sentences saying what you saw.`;
    const answer = await runner(['-p', prompt, '--model', model, '--output-format', 'json', '--json-schema', schema, '--print-timeout', '20m']);
    const { answered, failure } = readAnswer(answer);
    if (failure && !batch.retried && RATE_LIMITED.test(failure)) {
      if (width > 1) log(`agy turned a batch away (${failure.slice(0, 80)}): the rest one batch at a time`);
      width = 1;
      queue.unshift({ ...batch, retried: true });
      return false;
    }
    for (const it of list) {
      const v = answered.find((a) => a.key === it.key);
      byKey.set(
        it.key,
        v && VERDICTS.includes(v.verdict)
          ? { key: it.key, verdict: v.verdict, note: String(v.note ?? '') }
          : { key: it.key, verdict: 'unsure', note: failure ? `Not judged: ${failure}` : 'Not judged: agy left this capture out' },
      );
    }
    save();
    return true;
  };

  const pump = () => {
    while (running < width && queue.length) {
      const batch = queue.shift()!;
      running++;
      void judge(batch)
        .then(
          (finished) => {
            if (finished) batch.done();
          },
          (error) => {
            for (const it of batch.items) byKey.set(it.key, { key: it.key, verdict: 'unsure', note: `Not judged: ${String((error as Error)?.message ?? error)}` });
            save();
            batch.done();
          },
        )
        .finally(() => {
          running--;
          pump();
        });
    }
  };

  return {
    add(items) {
      const fresh = items.filter((it) => !order.includes(it.key));
      order.push(...fresh.map((it) => it.key));
      const batches: Promise<void>[] = [];
      for (let start = 0; start < fresh.length; start += size) {
        const list = fresh.slice(start, start + size);
        const first = numbered + 1;
        numbered += list.length;
        batches.push(new Promise<void>((done) => queue.push({ items: list, first, retried: false, done })));
      }
      pump();
      const together = Promise.all(batches).then(() => {});
      all.push(together);
      return together;
    },
    verdicts,
    async done() {
      await Promise.all(all);
      save();
      return verdicts();
    },
  };
}

/** Every capture that changed or is new (`all`: every capture), judged by agy; see [agyReviewer]. */
export async function reviewWithAgy(runDir: string, results: Result[], log: (line: string) => void, all = false, options: AgyOptions = {}) {
  const reviewer = agyReviewer(runDir, log, options);
  await reviewer.add(items(runDir, results, all));
  return reviewer.done();
}

/** The captures to judge on these platforms (the changed and new ones, the film's stills), for a review that goes by phase. */
export function itemsOn(runDir: string, results: Result[], platforms: readonly string[]): Item[] {
  return items(runDir, results).filter((it) => platforms.includes(it.key.split('/')[0]));
}

/** Every capture to judge (changed, new, the stills): what a review by phase hands over last, the reviewer skipping what it has. */
export const reviewItems = (runDir: string, results: Result[]): Item[] => items(runDir, results);

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
