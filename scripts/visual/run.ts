/**
 * `npm run visual -- <command>` — release screenshots on every platform,
 * compared with this machine's baseline, judged by a model, accepted by hand.
 * See scripts/visual/README.md.
 *
 *   capture [web android ios mac] [--only home,card] [--device phone] [--variants release|extended] [--no-stack] [--flows] [--review] [--wait]
 *            --variants extended: the release set plus the device states and variants of variants.ts (large text,
 *            the tablets turned and in the dark, a narrow Mac window, the composer's extra states)
 *            --flows: the Maestro flows on Android then iOS once the captures are done (stack still up);
 *            --tags a,b: only the flows tagged so; with --variants extended the `tablet` flows on the tablets too
 *            --review: the agy review straight after (what a release runs, with --flows)
 *            --wait: queue behind another run holding the same devices or ports (lock.ts), instead of refusing
 *            --force-build: build the apps even when their inputs match the last build's (buildStamp.ts)
 *            a run that stops moving (VISUAL_STALL_MIN) or runs too long (VISUAL_RUN_TIMEOUT_MIN) ends (watchdog.ts)
 *   compare  [--run <id>]          recompute the comparison and the report
 *   review   [--run <id>] [--agy | --gemini] [--all]   --all: unchanged captures too
 *   plan     [--variants release|extended]   how many captures each set takes, by platform, and roughly how long
 *   accept   --reason "<the owner's words>" [--run <id>] [--only <key|screen>,…]
 *            refused without --reason; each accept is a row of docs/visual-accept-log.md (acceptLog.ts)
 *
 * capture, compare and review end with the run's verdict — `Visual PASS|FAIL <id>: …` as the last
 * line, summary.json beside the report, exit code 1 on a FAIL (gate.ts says what fails a run).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acceptReason, appendAcceptLog, REASON_REQUIRED } from './acceptLog';
import { compareRun, type RunInfo } from './compare';
import { describe, foreign, lostDevices, runningDevices, type RunningDevice } from './devices';
import { gateLines, judgeRun } from './gate';
import { LockBusy, acquire, resourcesFor, type Lock, type LockHolder } from './lock';
import { writeReport } from './report';
import { reviewWithAgy, reviewWithGemini, writeReviewPack } from './review';
import { startStack, type Stack } from './stack';
import { BASELINE_DIR, PORTS, RUNS_DIR, VISUAL_DIR, git, ignorePath, listPngs, readJson, writeJson, type Capture } from './util';
import type { Platform } from './screens';
import { DEVICE_STATES, EXTRA_VARIANTS, VARIANT_SETS, estimate, variantSetOf } from './variants';
import { watchdog } from './watchdog';
import { nextMeta, type BaselineMeta } from './baselineMeta';
import type { Result } from './compare';

/** Every platform, in the order the report lists them. */
const PLATFORMS: Platform[] = ['web', 'android', 'ios', 'mac'];
/**
 * How a capture runs: these phases one after the other, the platforms of a phase side by side —
 * the web's headless browser beside the Mac app, then the two AVDs together, then the two
 * simulators together (each platform runs its own devices at once: VISUAL_PARALLEL=0 runs them one
 * at a time). Each phase frees its devices before the next boots.
 */
const PHASES: Platform[][] = [['web', 'mac'], ['android'], ['ios']];

async function capturer(platform: Platform): Promise<Capture> {
  switch (platform) {
    case 'web':
      return (await import('./web')).captureWeb;
    case 'ios':
      return (await import('./ios')).captureIos;
    case 'mac':
      return (await import('./mac')).captureMac;
    case 'android':
      return (await import('./android')).captureAndroid;
  }
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const list = (value: string | undefined) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);
const log = (line: string) => console.log(line);
/** The last run started on this machine; name a run with --run when two captures overlap. */
const LATEST = join(VISUAL_DIR, 'latest');

function runDirOf(args: string[]): string {
  const id = flag(args, 'run') ?? (existsSync(LATEST) ? readFileSync(LATEST, 'utf8').trim() : '');
  if (!id || !existsSync(join(RUNS_DIR, id))) throw new Error('No run to work on: capture one first, or pass --run <id>');
  return join(RUNS_DIR, id);
}

/** The comparison, the review brief and the report; answers the comparison, for the verdict after it. */
async function finish(runDir: string): Promise<Result[]> {
  const results = await compareRun(runDir, { log });
  // A brief written by `review --all` stays as it was.
  if (!existsSync(join(runDir, 'review', 'REVIEW.md'))) writeReviewPack(runDir, results);
  const report = writeReport(runDir, results);
  const count = (s: string) => results.filter((r) => r.status === s).length;
  log(`\nRun ${runDir.split('/').pop()}: ${count('changed')} changed · ${count('new')} new · ${count('missing')} missing · ${count('unchanged')} unchanged`);
  log(`Report: ${report}`);
  log(`Review brief for an agent: ${join(runDir, 'review', 'REVIEW.md')}`);
  return results;
}

async function capture(args: string[]) {
  // Always in PHASES' order, whatever order they were named in.
  const named = args.filter((a): a is Platform => PLATFORMS.includes(a as Platform));
  const platforms = PLATFORMS.filter((p) => !named.length || named.includes(p));
  const set = variantSetOf(flag(args, 'variants'));
  // The apps built even when their inputs match the last build's (buildStamp.ts).
  if (args.includes('--force-build')) process.env.VISUAL_FORCE_BUILD = '1';
  // A run that stops moving or runs too long ends (watchdog.ts), and so does one whose lock another run took over
  // (its beat had stopped: lock.ts). Set once the run has begun.
  let abort: (why: string) => void = () => {};
  // One run at a time on these devices and these ports (lock.ts): refused, or queued with --wait, before anything starts.
  const lock = await lockFor(platforms, !args.includes('--no-stack'), args.includes('--wait'), (resource, holder) =>
    abort(`another run (pid ${holder?.pid ?? '?'}) took over its ${resource} lock: this one's beat had stopped`),
  );
  if (!lock) return;
  const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const runDir = join(RUNS_DIR, id);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(LATEST, id);
  const info: RunInfo = {
    id,
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    startedAt: new Date().toISOString(),
    platforms,
    only: list(flag(args, 'only')),
    devices: list(flag(args, 'device')),
    unsettled: [],
    retaken: [],
    variants: set,
  };
  writeJson(join(runDir, 'run.json'), info);
  let stack: Stack | undefined;
  const dog = watchdog((why) => abort(why));
  // Every line the run says is progress (each capture, build, boot and phase says one).
  const say = (line: string) => {
    dog.progress();
    log(line);
  };
  abort = (why) => {
    dog.stop();
    info.aborted = why;
    writeJson(join(runDir, 'run.json'), info);
    try {
      stack?.stop();
    } finally {
      lock.release();
    }
    log(`\nVisual FAIL ${id}: aborted — ${why}. The devices it booted may still run; its locks are free. → ${join(runDir, 'run.json')}`);
    process.exit(1);
  };
  if (set !== 'release') log(`Variants: ${set} (${estimate(set).captures} captures in all, about ${estimate(set).minutes} min; npm run visual -- plan)`);

  // The others' devices as the run starts: the harness never shuts one down, and says if one went down anyway (devices.ts).
  const apps = platforms.some((p) => p !== 'web');
  const before: RunningDevice[] = apps ? runningDevices() : [];
  if (foreign(before).length) log(`Left alone while this runs: ${foreign(before).map(describe).join(', ')}`);
  try {
    stack = args.includes('--no-stack')
      ? { devUrl: process.env.VISUAL_DEV_URL || `http://localhost:${PORTS.dev}`, stop: () => {} }
      : await startStack(join(runDir, '_logs'), say);
    const ctx = { runDir, devUrl: stack.devUrl, ports: PORTS, only: info.only, devices: info.devices, log: say, retaken: info.retaken!, set };
    // The apps' builds start now, beside the first phase's captures, so a later phase finds its app
    // ready (each build is made once; the Xcode ones take turns). A failed one fails its phase.
    const headStart: Promise<unknown>[] = [];
    if (platforms.includes('android')) headStart.push((await import('./android')).build(ctx));
    if (platforms.includes('ios')) headStart.push((await import('./ios')).build(ctx));
    headStart.forEach((p) => p.catch(() => {}));
    for (const phase of PHASES) {
      const here = phase.filter((p) => platforms.includes(p));
      if (!here.length) continue;
      say(`\n== ${here.join(' + ')}`);
      const unsettled = await Promise.all(here.map(async (platform) => (await capturer(platform))(ctx)));
      info.unsettled.push(...unsettled.flat());
      writeJson(join(runDir, 'run.json'), info);
    }
    if (args.includes('--flows')) {
      info.flowsFailed = await flows(runDir, platforms, stack.devUrl, list(flag(args, 'tags')), set === 'extended', say);
      writeJson(join(runDir, 'run.json'), info);
    }
  } finally {
    dog.stop();
    stack?.stop();
    if (apps) {
      const lost = lostDevices(before, runningDevices());
      if (lost.length) {
        info.devicesLost = lost.map(describe);
        writeJson(join(runDir, 'run.json'), info);
      }
    }
    lock.release();
  }
  let results = await finish(runDir);
  if (args.includes('--review')) results = await review(runDir, ['--agy'], results);
  await gate(runDir, results);
}

/** The run's locks (lock.ts), or null after saying why it doesn't start (exit code 1). */
async function lockFor(platforms: Platform[], ownStack: boolean, wait: boolean, onLost?: (resource: string, holder: LockHolder | null) => void): Promise<Lock | null> {
  try {
    return await acquire(resourcesFor(platforms, ownStack ? PORTS : null), { wait, log, onLost });
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    console.error(error.message);
    process.exitCode = 1;
    return null;
  }
}

/**
 * The run's verdict, last on the console: the problems, then one `Visual PASS|FAIL` line naming
 * summary.json — and exit code 1 on a FAIL (gate.ts says what fails a run).
 */
async function gate(runDir: string, results?: Result[]) {
  const { summary, file } = judgeRun(runDir, results ?? (await compareRun(runDir, { log })));
  log('');
  for (const line of gateLines(summary, file)) log(line);
  if (!summary.pass) process.exitCode = 1;
}

/**
 * The Maestro flows (scripts/visual/flows.ts) on the apps this capture took, after every capture:
 * one device at a time, as the captures (`--tags`: only those flows; the extended set also runs the
 * `tablet`-tagged flows on the iPad and the Android tablet). Reports in `<run>/_flows/` (out of the
 * captures' way); the failed ones are answered, kept in run.json, and fail the run (gate.ts).
 */
async function flows(runDir: string, platforms: Platform[], devUrl: string, tags: string[], tablets: boolean, log: (line: string) => void): Promise<string[]> {
  const { runFlows } = await import('./flows');
  const failed: string[] = [];
  for (const platform of (['android', 'ios'] as const).filter((p) => platforms.includes(p))) {
    for (const device of tablets ? (['phone', 'tablet'] as const) : (['phone'] as const)) {
      log(`\n== flows on the ${platform} ${device}${tags.length ? ` (tags ${tags.join(', ')})` : ''}`);
      const ctx = { runDir: join(runDir, '_flows'), devUrl, ports: PORTS, only: [], devices: [], log, retaken: [] };
      const results = await runFlows(platform, ctx, { tags, device });
      failed.push(...results.filter((r) => !r.passed).map((r) => `${platform}${device === 'tablet' ? '-tablet' : ''}/${r.flow}`));
    }
  }
  log(failed.length ? `Flows failed: ${failed.join(', ')} (reports in ${join(runDir, '_flows')})` : 'Flows: all passed');
  return failed;
}

async function review(runDir: string, args: string[], given?: Result[]): Promise<Result[]> {
  const results = given ?? (await compareRun(runDir, { log }));
  const all = args.includes('--all');
  if (args.includes('--agy')) await reviewWithAgy(runDir, results, log, all);
  else if (args.includes('--gemini')) await reviewWithGemini(runDir, results, log, all);
  log(`Review brief: ${writeReviewPack(runDir, results, all)}`);
  log(`Report: ${writeReport(runDir, results)}`);
  return results;
}

/**
 * Copies a run's captures into the baseline: all of them, or the keys / screen ids given — only with
 * a `--reason` (the owner's words, or what the accept rests on), recorded in docs/visual-accept-log.md.
 */
async function accept(args: string[]) {
  const reason = acceptReason(args);
  if (!reason) {
    console.error(REASON_REQUIRED);
    process.exitCode = 1;
    return;
  }
  const runDir = runDirOf(args);
  const info = readJson<RunInfo>(join(runDir, 'run.json'))!;
  const only = list(flag(args, 'only'));
  const keys = listPngs(runDir).filter((k) => !only.length || only.some((o) => k === o || k.split('/').pop()!.startsWith(`${o}@`)));
  if (!keys.length) {
    console.error(`Nothing in ${info.id} matches ${only.length ? `--only ${only.join(',')}` : 'the run'}: nothing was accepted.`);
    process.exitCode = 1;
    return;
  }
  for (const key of keys) {
    const to = join(BASELINE_DIR, key);
    mkdirSync(join(to, '..'), { recursive: true });
    writeFileSync(to, readFileSync(join(runDir, key)));
    // The regions it asked the comparison to skip go with it (or a stale list goes).
    const ignore = ignorePath(join(runDir, key));
    if (existsSync(ignore)) writeFileSync(ignorePath(to), readFileSync(ignore));
    else rmSync(ignorePath(to), { force: true });
  }
  // Each capture keeps the commit it was accepted at, and the platform's commit is the oldest of them (baselineMeta.ts):
  // an accept of a few screens no longer moves the start of the other screens' trailers.
  const acceptedAt = new Date().toISOString();
  const inBaseline = listPngs(BASELINE_DIR);
  for (const platform of new Set(keys.map((k) => k.split('/')[0]))) {
    const file = join(BASELINE_DIR, platform, 'meta.json');
    const mine = (k: string) => k.startsWith(`${platform}/`);
    writeJson(file, nextMeta(readJson<BaselineMeta>(file), keys.filter(mine), inBaseline.filter(mine), { commit: info.commit, run: info.id, acceptedAt, reason }));
  }
  appendAcceptLog({ at: new Date(), run: info.id, commit: info.commit, dirty: info.dirty, keys, only, reason });
  log(`Accepted ${keys.length} capture(s) from ${info.id} into ${BASELINE_DIR}`);
  log(`Recorded in docs/visual-accept-log.md — commit it with the accept: git commit -- docs/visual-accept-log.md`);
  await finish(runDir);
}

/** What each variant set takes and costs (variants.ts), without taking anything. */
function planOf(args: string[]) {
  const sets = flag(args, 'variants') ? [variantSetOf(flag(args, 'variants'))] : VARIANT_SETS;
  const release = estimate('release');
  for (const set of sets) {
    const e = estimate(set);
    const by = Object.entries(e.byPlatform).map(([p, n]) => `${p} ${n}`).join(', ');
    const more = set === 'release' ? '' : ` — ${e.captures - release.captures} more than release, about ${e.minutes - release.minutes} min more`;
    log(`${set}: ${e.captures} captures (${by}), about ${e.minutes} min of captures${more}`);
  }
  if (sets.includes('extended')) {
    log('\nThe extended set adds:');
    for (const s of DEVICE_STATES) log(`  ${s.platform}/${s.id} (on ${s.on}): ${s.screens.length} screens — ${s.why}`);
    for (const x of EXTRA_VARIANTS) log(`  ${x.platform}/${x.device} ${x.variants.map((v) => `${v.theme}-${v.locale}`).join(', ')}: ${x.screens.length} screens — ${x.why}`);
    log('  and its own screens (screens.ts `set: extended`) on their devices: thread-attach, thread-keyboard');
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'capture':
      return capture(args);
    case 'compare': {
      const runDir = runDirOf(args);
      return gate(runDir, await finish(runDir));
    }
    case 'review': {
      const runDir = runDirOf(args);
      return gate(runDir, await review(runDir, args));
    }
    case 'accept':
      return accept(args);
    case 'plan':
      return planOf(args);
    default:
      log('Usage: npm run visual -- capture [web android ios mac] [--only ids] [--device ids] [--variants release|extended] [--no-stack] [--flows] [--review] [--wait] | compare | review [--agy | --gemini] [--all] | accept --reason "<the owner\'s words>" [--only keys]  (each with --run <id>) | plan [--variants …]');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
