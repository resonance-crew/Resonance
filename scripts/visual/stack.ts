/**
 * The stack every capture runs against: a private pair of Firebase emulators
 * (`emulators-at.mjs` on PORTS, beside any shared ones another session uses),
 * seeded fresh with `seed-emulator.ts`'s test world, and the Next dev server
 * wired to them (`dev-emulator.mjs`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { PORTS, ROOT, run, sleep, startGroup, stopGroup, waitForPort } from './util';

export type Stack = { devUrl: string; stop: () => void };

const emulatorPorts = () => ({
  EMULATOR_AUTH_PORT: String(PORTS.auth),
  EMULATOR_FIRESTORE_PORT: String(PORTS.firestore),
});

/**
 * The Firestore emulator's Java heap (`VISUAL_FIRESTORE_HEAP`, default 1g): firebase-tools starts it with no `-Xmx`,
 * so the JVM may grow to a quarter of the machine (6 GB here) for a test world of a few hundred documents. The JVM
 * reads JAVA_TOOL_OPTIONS whoever starts it; only the emulators' process group gets it (the Auth emulator is Node).
 * The serial collector keeps the footprint small (G1 sizes itself for ten cores).
 */
export function emulatorsEnv(): Record<string, string> {
  const heap = process.env.VISUAL_FIRESTORE_HEAP || '1g';
  const own = [process.env.JAVA_TOOL_OPTIONS, `-Xmx${heap}`, '-XX:+UseSerialGC'].filter(Boolean).join(' ');
  return { ...emulatorPorts(), JAVA_TOOL_OPTIONS: own };
}

/**
 * The seeded world's "now": a fixed day well in the past, so every date a
 * screen shows is the same on every run (relative times like "3 週前" only
 * appear for the newest things, and the screens show dates past a few days).
 */
export const SEED_NOW = '2026-09-01T12:00:00+08:00';

/**
 * What the seed is run with: the stack's emulators; EMULATOR_DEV_PORT, where the seed's stored cover is served from
 * (this stack's dev server), so the apps load it too; SEED_NOW, the world's fixed day; SEED_RESET, since the stack's
 * emulators are its own, so each seed starts from an empty database (a flow's writes never carry into the next flow
 * or capture); SEED_PICKS=none, so nobody has picks and home is the same on every platform and run (noPicks.ts).
 */
export const seedEnv = () => ({ ...emulatorPorts(), EMULATOR_DEV_PORT: String(PORTS.dev), SEED_NOW, SEED_RESET: '1', SEED_PICKS: 'none' });

/**
 * The seed, once more when it fails. After a long run of flows the emulator now and then cancels one of the seed's
 * writes ("1 CANCELLED: call already cancelled", run 20261119-030144 and the one before it, both in the iOS flows):
 * the seed stopped there and so did every flow after it. SEED_RESET makes a second seed start from an empty database
 * again, so it can simply be run again; a seed that fails twice is a real fault and stops the run.
 */
export async function seed(log: (line: string) => void, attempts = 2, pause = 2_000) {
  for (let attempt = 1; ; attempt++) {
    log(attempt === 1 ? 'Seeding the test world (scripts/seed-emulator.ts)…' : 'Seeding the test world again…');
    try {
      run('npx', ['tsx', 'scripts/seed-emulator.ts'], seedEnv());
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const said = String((error as { stderr?: string }).stderr || (error as Error).message || error).split('\n').find((l) => l.trim()) ?? '';
      log(`  the seed failed (${said.trim().slice(0, 120)}): once more`);
      await sleep(pause);
    }
  }
}

/**
 * The stack's `next dev`: its own build folder and tsconfig, the emulators' ports, and every page it compiles kept
 * for the whole run (`VISUAL_KEEP_PAGES`, next.config.ts `onDemandEntries`) — the devices ask for the same pages
 * one after another, and a page dropped meanwhile is compiled again.
 */
export function devServerEnv(distDir: string, tsconfig: string): Record<string, string> {
  return { ...emulatorPorts(), NEXT_DIST_DIR: distDir, NEXT_TSCONFIG_PATH: tsconfig, VISUAL_KEEP_PAGES: '1' };
}

export async function startStack(logDir: string, log: (line: string) => void): Promise<Stack> {
  const children: ChildProcess[] = [];
  // `next dev` rewrites the tracked next-env.d.ts to name its distDir: point it
  // back at `.next` (whatever another stack left there).
  const nextEnv = join(ROOT, 'next-env.d.ts');
  const restoreNextEnv = () => {
    const text = readFileSync(nextEnv, 'utf8');
    const fixed = text.replace(/\.\/\.next-visual\/\d+\/types\//g, './.next/types/');
    if (fixed !== text) writeFileSync(nextEnv, fixed);
  };
  const stop = () => {
    children.reverse().forEach(stopGroup);
    restoreNextEnv();
  };
  process.once('SIGINT', () => (stop(), process.exit(130)));
  try {
    log(`Starting emulators on auth ${PORTS.auth} / firestore ${PORTS.firestore}…`);
    children.push(startGroup('node', ['scripts/emulators-at.mjs'], emulatorsEnv(), join(logDir, 'emulators.log')));
    await waitForPort(PORTS.auth, 90_000);
    await waitForPort(PORTS.firestore, 90_000);
    await seed(log);

    log(`Starting the dev server on ${PORTS.dev}…`);
    // Its own build folder (next.config's distDir): another session's `next dev`
    // in this checkout would otherwise overwrite its chunks mid-run.
    const distDir = `.next-visual/${PORTS.dev}`;
    const tsconfig = join(ROOT, `.next-visual/tsconfig.${PORTS.dev}.json`);
    mkdirSync(join(ROOT, '.next-visual'), { recursive: true });
    writeFileSync(tsconfig, JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { baseUrl: '..', paths: { '@/*': ['./src/*'] } } }, null, 2) + '\n');
    const env = devServerEnv(distDir, relative(ROOT, tsconfig));
    children.push(startGroup('node', ['scripts/dev-emulator.mjs', '--port', String(PORTS.dev)], env, join(logDir, 'dev.log')));
    await waitForPort(PORTS.dev, 120_000);
    const devUrl = `http://localhost:${PORTS.dev}`;
    // The first request compiles the middleware and the locale layout: wait for a real answer.
    for (let i = 0; i < 60; i++) {
      const ok = await fetch(`${devUrl}/zh-TW`).then((r) => r.ok, () => false);
      if (ok) break;
      await sleep(2000);
    }
    restoreNextEnv();
    return { devUrl, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
