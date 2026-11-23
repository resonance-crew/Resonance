/**
 * `npm run visual -- <command>` — release screenshots on every platform,
 * compared with this machine's baseline, judged by a model, accepted by hand.
 * See scripts/visual/README.md.
 *
 *   capture [web android ios mac] [--only home,card] [--device phone] [--variants release|extended] [--no-stack] [--flows] [--review] [--wait]
 *            --<platform>-only a,b / --<platform>-device x,y: that platform's own slice in the same run (round-verify takes
 *            every platform's slice in one run: one stack, the builds beside the first phase, no gaps between runs)
 *            --variants extended: the release set plus the device states and variants of variants.ts (large text,
 *            the tablets turned and in the dark, a narrow Mac window, the composer's extra states)
 *            --flows: the Maestro flows on Android then iOS once the captures are done (stack still up);
 *            --tags a,b: only the flows tagged so; with --variants extended the `tablet` flows on the tablets too
 *            --review: the agy review straight after (what a release runs, with --flows)
 *            --wait: queue behind another run holding the same devices or ports (lock.ts), instead of refusing
 *            --force-build: build the apps even when their inputs match the last build's (buildStamp.ts)
 *            --changed [--since <ref>] [--dry-run]: only the platforms a change since their baseline can move (changed.ts;
 *            opt-in, never with --flows); --dry-run says the plan and captures nothing
 *            a run that stops moving (VISUAL_STALL_MIN) or runs too long (VISUAL_RUN_TIMEOUT_MIN) ends (watchdog.ts)
 *   compare  [--run <id>]          recompute the comparison and the report
 *   review   [--run <id>] [--agy | --gemini] [--all]   --all: unchanged captures too
 *   plan     [--variants release|extended]   how many captures each set takes, by platform, and roughly how long
 *   accept   --reason "<the owner's words>" [--run <id> | --runs <id>,<id>,…] [--only <key|screen>,…]
 *            refused without --reason; each run accepted is a row of docs/visual-accept-log.md (acceptLog.ts);
 *            with --runs, a capture several runs took comes from the one named last (accept.ts)
 *   promote  --from <branch> --reason "<the owner's words>" [--only <key|screen>,…] [--allow-unmerged]
 *            a branch's (a round's) accepted pictures into main's baseline, once main has its commits (promote.ts)
 *   baselines                     main's and every branch's baseline, and which one this checkout uses (baselines.ts)
 *   prune    [--keep N] [--dry-run]   old runs out of visual/runs/: never the newest N (20), one a baseline or an accept
 *            log names, visual/latest, or one that may still be running (prune.ts)
 *
 * capture, compare and review end with the run's verdict — `Visual PASS|FAIL <id>: …` as the last
 * line, summary.json beside the report, exit code 1 on a FAIL (gate.ts says what fails a run).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acceptReason, REASON_REQUIRED } from './acceptLog';
import { applyAccept, planAccept } from './accept';
import { compareRun, sliceOf, slicesOf, type RunInfo } from './compare';
import { describe, foreign, lostDevices, runningDevices, type RunningDevice } from './devices';
import { gateLines, judgeRun } from './gate';
import { LockBusy, acquire, resourcesFor, type Lock, type LockHolder } from './lock';
import { writeReport } from './report';
import { agyReviewer, itemsOn, reviewItems, reviewWithAgy, reviewWithGemini, writeReviewPack } from './review';
import { startStack, type Stack } from './stack';
import { PORTS, ROOT, RUNS_DIR, VISUAL_DIR, git, ignorePath, listPngs, readJson, writeJson, type Capture } from './util';
import { MAIN, MAIN_BASELINE, baselineDir, baselineFolder, currentBaselineName, ensureBaseline, listBaselines, runBaselineName } from './baselines';
import { changedPlan, planLines, refusesChanged } from './changed';
import { applyPromote, planPromote } from './promote';
import { execFileSync } from 'node:child_process';
import type { Platform } from './screens';
import { DEVICE_STATES, EXTRA_VARIANTS, VARIANT_SETS, estimate, variantSetOf } from './variants';
import { watchdog } from './watchdog';
import { PHASES, buildOrder } from './phases';
import { DEFAULT_KEEP, prune } from './prune';
import { startSampler } from './resources';
import { writeTiming, writeTimingsSummary } from './timings';
import { HARNESS_SIMULATORS } from './devices';
import type { Result } from './compare';

/** Every platform, in the order the report lists them. */
const PLATFORMS: Platform[] = ['web', 'android', 'ios', 'mac'];

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
  let platforms = PLATFORMS.filter((p) => !named.length || named.includes(p));
  // --changed (opt-in, slices only): the platforms whose screens can't have moved since their baseline are left out
  // (changed.ts). Without it, nothing here runs and every named platform is captured, as always.
  let changed: RunInfo['changed'];
  if (args.includes('--changed')) {
    const refused = refusesChanged(args);
    if (refused) {
      console.error(refused);
      process.exitCode = 1;
      return;
    }
    const plan = changedPlan(platforms, { baselineDir: plannedBaselineDir(), since: flag(args, 'since') });
    for (const line of planLines(plan)) log(line);
    if (args.includes('--dry-run')) return log('--dry-run: nothing captured');
    const taken = plan.filter((p) => p.run).map((p) => p.platform);
    if (!taken.length) return log("Nothing to capture: no platform's screens can have moved since its baseline (capture without --changed to take them anyway).");
    changed = { since: Object.fromEntries(plan.map((p) => [p.platform, p.since])), skipped: plan.filter((p) => !p.run).map((p) => p.platform) };
    platforms = taken;
  } else if (args.includes('--dry-run') || args.includes('--since')) {
    console.error('--dry-run and --since go with --changed (the plan of what --changed would capture). Nothing was captured.');
    process.exitCode = 1;
    return;
  }
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
    // This checkout's baseline (baselines.ts): main's on main, its round's on a round's branches, its own elsewhere.
    baseline: currentBaselineName(),
    ...(changed ? { changed } : {}),
  };
  baselineDir(log);
  log(`Baseline: ${info.baseline}`);
  // A platform --changed left out may have had its own slice named (--ios-only …): read as named, then let go.
  const slices = slicesOf(args, changed ? [...platforms, ...changed.skipped] : platforms);
  for (const skipped of changed?.skipped ?? []) delete slices[skipped];
  if (Object.keys(slices).length) info.slices = slices;
  writeJson(join(runDir, 'run.json'), info);
  let stack: Stack | undefined;
  const dog = watchdog((why) => abort(why));
  // What the run costs the machine, every few seconds, by phase (resources.ts): `_resources.jsonl` / `_resources.json`.
  const sampler = startSampler(runDir, { log, simulators: HARNESS_SIMULATORS, holds: new Set(platforms.filter((p): p is 'ios' | 'mac' | 'android' => p !== 'web')) });
  // --review: agy judges each phase's changed captures as the phase ends, several batches at once (review.ts).
  const reviewer = args.includes('--review') ? agyReviewer(runDir, (line) => log(line)) : null;
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
    // ready (each build is made once; the Xcode ones take turns, in the order their phases come: phases.ts). A failed
    // one fails its phase.
    const headStart: Promise<unknown>[] = [];
    for (const platform of buildOrder(platforms)) {
      const started = Date.now();
      const timed = (p: Promise<void>) => p.then(() => writeTiming(runDir, { key: `build/${platform}`, kind: 'build', totalMs: Date.now() - started, steps: {}, at: new Date().toISOString() }));
      if (platform === 'mac') headStart.push(timed((await import('./mac')).build(ctx)));
      if (platform === 'android') headStart.push(timed((await import('./android')).build(ctx)));
      if (platform === 'ios') headStart.push(timed((await import('./ios')).build(ctx)));
    }
    headStart.forEach((p) => p.catch(() => {}));
    for (const phase of PHASES) {
      const here = phase.filter((p) => platforms.includes(p));
      if (!here.length) continue;
      say(`\n== ${here.join(' + ')}`);
      sampler.mark(here.join('+'));
      // Each platform with its own slice (--ios-only …), else the run's.
      const unsettled = await Promise.all(here.map(async (platform) => (await capturer(platform))({ ...ctx, ...sliceOf(info, platform) })));
      info.unsettled.push(...unsettled.flat());
      writeJson(join(runDir, 'run.json'), info);
      // --review: what this phase changed goes to agy now, judged beside the next phases and the flows (review.ts).
      if (reviewer) void reviewer.add(itemsOn(runDir, await compareRun(runDir, { log: say }), here));
    }
    if (args.includes('--flows')) {
      sampler.mark('flows');
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
    sampler.releaseDevices();
  }
  sampler.mark('compare');
  let results = await finish(runDir);
  if (reviewer) {
    // Whatever no phase handed over yet (none, unless a phase failed before its turn), then what is still being judged.
    sampler.mark('review');
    await reviewer.add(reviewItems(runDir, results));
    await reviewer.done();
    results = await review(runDir, [], results);
  }
  await sampler.stop();
  for (const line of writeTimingsSummary(runDir)) log(line);
  await gate(runDir, results);
}

/**
 * The baseline a capture here would compare with, without making it: this checkout's own when it exists, else main's,
 * which a branch's first run clones (baselines.ts) — so --changed --dry-run creates nothing.
 */
function plannedBaselineDir(): string {
  const folder = baselineFolder(currentBaselineName());
  return existsSync(folder) ? folder : MAIN_BASELINE;
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
 * Copies one run's captures, or several runs' (`--runs a,b`), into the baseline: all of them, or the keys / screen ids
 * given — only with a `--reason` (the owner's words, or what the accept rests on), recorded in
 * docs/visual-accept-log.md, one row per run (accept.ts). Each run's comparison is then judged again where it changed.
 */
async function accept(args: string[]) {
  const reason = acceptReason(args);
  if (!reason) {
    console.error(REASON_REQUIRED);
    process.exitCode = 1;
    return;
  }
  const only = list(flag(args, 'only'));
  const runs = list(flag(args, 'runs'));
  const runDirs = runs.length ? runs.map((id) => join(RUNS_DIR, id)) : [runDirOf(args)];
  const planned = planAccept(runDirs, only);
  if ('error' in planned) {
    console.error(planned.error);
    process.exitCode = 1;
    return;
  }
  // Into the baseline the runs were compared with (baselines.ts): one, or none.
  const names = [...new Set(runDirs.map(runBaselineName))];
  if (names.length > 1) {
    console.error(`These runs were taken against different baselines (${names.join(', ')}): accept them one baseline at a time. Nothing was accepted.`);
    process.exitCode = 1;
    return;
  }
  const into = ensureBaseline(names[0]).folder;
  for (const line of planned.replaced) log(`  not taken: ${line}`);
  for (const { run, count } of applyAccept(planned.plans, { reason, only, baselineDir: into })) {
    log(`Accepted ${count} capture(s) from ${run} into the ${names[0]} baseline (${into})`);
  }
  log(`Recorded in docs/visual-accept-log.md — commit it with the accept: git commit -- docs/visual-accept-log.md`);
  // Every named run compared again (only what the copies changed is judged again: compare.ts).
  for (const dir of runDirs) await finish(dir);
}

/** Whether main's history has `commit` (the promote's check: a branch's pictures go to main's once its work is there). */
function onMain(commit: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, MAIN], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A branch's accepted pictures into main's baseline (promote.ts), on the owner's word. */
function promote(args: string[]) {
  const reason = acceptReason(args);
  if (!reason) {
    console.error(REASON_REQUIRED.replace('accept needs', 'promote needs'));
    process.exitCode = 1;
    return;
  }
  const only = list(flag(args, 'only'));
  const plan = planPromote(flag(args, 'from') ?? '', { root: VISUAL_DIR, only, onMain });
  if ('error' in plan) {
    console.error(plan.error);
    process.exitCode = 1;
    return;
  }
  if (plan.unmerged.length) {
    const what = `${plan.unmerged.length} commit(s) these pictures were taken at are not in main's history: ${plan.unmerged.map((c) => c.slice(0, 8)).join(', ')}`;
    if (!args.includes('--allow-unmerged')) {
      console.error(`${what}. Merge ${plan.branch} into main first, or — if it reached main another way (a squash, a cherry-pick) — add --allow-unmerged. Nothing was promoted.`);
      process.exitCode = 1;
      return;
    }
    log(`Warning: ${what} — promoted anyway (--allow-unmerged)`);
  }
  for (const { run, commit, count } of applyPromote(plan, { root: VISUAL_DIR, reason, only })) {
    log(`Promoted ${count} picture(s) of ${run} (${commit.slice(0, 8)}) from ${plan.branch} into main's baseline`);
  }
  log(`Recorded in docs/visual-accept-log.md — commit it with the work: git commit -- docs/visual-accept-log.md`);
}

/** main's baseline and every branch's, and which one this checkout uses. */
function baselinesOf() {
  const mine = currentBaselineName();
  for (const b of listBaselines()) {
    const count = listPngs(b.folder).length;
    log(`${b.name === mine ? '*' : ' '} ${b.name.padEnd(36)} ${String(count).padStart(4)} pictures  ${b.info ? `made from main's ${b.info.clonedAt}` : ''}  ${b.folder}`);
  }
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
    case 'promote':
      return promote(args);
    case 'baselines':
      return baselinesOf();
    case 'plan':
      return planOf(args);
    case 'prune': {
      // Old runs out of visual/runs/, never one a baseline or an accept log names, the newest, or one maybe running.
      const keep = Number(flag(args, 'keep') ?? DEFAULT_KEEP);
      if (!Number.isInteger(keep) || keep < 0) throw new Error(`--keep takes a whole number, not "${flag(args, 'keep')}"`);
      prune({ keep, dryRun: args.includes('--dry-run'), log });
      return;
    }
    default:
      log('Usage: npm run visual -- capture [web android ios mac] [--only ids] [--device ids] [--variants release|extended] [--no-stack] [--flows] [--review] [--wait] | compare | review [--agy | --gemini] [--all] | accept --reason "<the owner\'s words>" [--only keys] [--runs a,b]  (each with --run <id>) | plan [--variants …]');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
