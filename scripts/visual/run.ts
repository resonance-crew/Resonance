/**
 * `npm run visual -- <command>` — release screenshots on every platform,
 * compared with this machine's baseline, judged by a model, accepted by hand.
 * See scripts/visual/README.md.
 *
 *   capture [web ios android mac] [--only home,card] [--device phone] [--no-stack]
 *   compare  [--run <id>]          recompute the comparison and the report
 *   review   [--run <id>] [--gemini] [--all]   --all: unchanged captures too
 *   accept   [--run <id>] [--only <key|screen>,…]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareRun, type RunInfo } from './compare';
import { writeReport } from './report';
import { reviewWithGemini, writeReviewPack } from './review';
import { startStack, type Stack } from './stack';
import { BASELINE_DIR, PORTS, RUNS_DIR, VISUAL_DIR, git, listPngs, readJson, writeJson, type Capture } from './util';
import type { Platform } from './screens';

const PLATFORMS: Platform[] = ['web', 'ios', 'android', 'mac'];

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

function finish(runDir: string) {
  const results = compareRun(runDir);
  writeReviewPack(runDir, results);
  const report = writeReport(runDir, results);
  const count = (s: string) => results.filter((r) => r.status === s).length;
  log(`\nRun ${runDir.split('/').pop()}: ${count('changed')} changed · ${count('new')} new · ${count('missing')} missing · ${count('unchanged')} unchanged`);
  log(`Report: ${report}`);
  log(`Review brief for an agent: ${join(runDir, 'review', 'REVIEW.md')}`);
}

async function capture(args: string[]) {
  const platforms = args.filter((a): a is Platform => PLATFORMS.includes(a as Platform));
  if (!platforms.length) platforms.push(...PLATFORMS);
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
  };
  writeJson(join(runDir, 'run.json'), info);

  let stack: Stack | undefined;
  try {
    stack = args.includes('--no-stack')
      ? { devUrl: process.env.VISUAL_DEV_URL || `http://localhost:${PORTS.dev}`, stop: () => {} }
      : await startStack(join(runDir, '_logs'), log);
    for (const platform of platforms) {
      log(`\n== ${platform}`);
      const unsettled = await (await capturer(platform))({
        runDir,
        devUrl: stack.devUrl,
        ports: PORTS,
        only: info.only,
        devices: info.devices,
        log,
      });
      info.unsettled.push(...unsettled);
      writeJson(join(runDir, 'run.json'), info);
    }
  } finally {
    stack?.stop();
  }
  finish(runDir);
}

/** Copies a run's captures into the baseline: all of them, or the keys / screen ids given. */
function accept(args: string[]) {
  const runDir = runDirOf(args);
  const info = readJson<RunInfo>(join(runDir, 'run.json'))!;
  const only = list(flag(args, 'only'));
  const keys = listPngs(runDir).filter((k) => !only.length || only.some((o) => k === o || k.split('/').pop()!.startsWith(`${o}@`)));
  for (const key of keys) {
    const to = join(BASELINE_DIR, key);
    mkdirSync(join(to, '..'), { recursive: true });
    writeFileSync(to, readFileSync(join(runDir, key)));
  }
  for (const platform of new Set(keys.map((k) => k.split('/')[0]))) {
    writeJson(join(BASELINE_DIR, platform, 'meta.json'), { commit: info.commit, run: info.id, acceptedAt: new Date().toISOString() });
  }
  log(`Accepted ${keys.length} capture(s) from ${info.id} into ${BASELINE_DIR}`);
  finish(runDir);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'capture':
      return capture(args);
    case 'compare':
      return finish(runDirOf(args));
    case 'review': {
      const runDir = runDirOf(args);
      const results = compareRun(runDir);
      const all = args.includes('--all');
      if (args.includes('--gemini')) await reviewWithGemini(runDir, results, log, all);
      else log(`Hand this to a reviewing agent: ${writeReviewPack(runDir, results, all)}`);
      return log(`Report: ${writeReport(runDir, results)}`);
    }
    case 'accept':
      return accept(args);
    default:
      log('Usage: npm run visual -- capture [web ios android mac] [--only ids] [--device ids] [--no-stack] | compare | review [--gemini] | accept [--only keys]');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
