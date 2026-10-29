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
 * The seeded world's "now": a fixed day well in the past, so every date a
 * screen shows is the same on every run (relative times like "3 週前" only
 * appear for the newest things, and the screens show dates past a few days).
 */
export const SEED_NOW = '2026-09-01T12:00:00+08:00';

export async function seed(log: (line: string) => void) {
  log('Seeding the test world (scripts/seed-emulator.ts)…');
  run('npx', ['tsx', 'scripts/seed-emulator.ts'], { ...emulatorPorts(), SEED_NOW });
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
    children.push(startGroup('node', ['scripts/emulators-at.mjs'], emulatorPorts(), join(logDir, 'emulators.log')));
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
    const env = { ...emulatorPorts(), NEXT_DIST_DIR: distDir, NEXT_TSCONFIG_PATH: relative(ROOT, tsconfig) };
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
