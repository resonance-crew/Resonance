#!/usr/bin/env node
/**
 * `npm run dev:emulator` — Next dev server wired to the local Firebase
 * emulators (start them first with `npm run emulators`). Extra args are passed
 * through to `next dev` (e.g. `-- --port 3100`).
 *
 * Pictures uploaded meanwhile go to a folder on this machine (lib/storage/local)
 * and are served by this same server, so their public base is its own address.
 */
import { spawn } from 'node:child_process';
import { emulatorEnv } from './emulator-env.mjs';

const args = process.argv.slice(2);
/** The port `next dev` will listen on: `--port N`, `--port=N`, `-p N`, else PORT, else Next's 3000. */
function devPort() {
  for (let i = 0; i < args.length; i++) {
    const [flag, value] = args[i].split('=');
    if (flag === '--port' || flag === '-p') return value ?? args[i + 1];
  }
  return process.env.PORT || '3000';
}

const child = spawn('npx', ['next', 'dev', ...args], {
  stdio: 'inherit',
  env: { ...process.env, ...emulatorEnv, R2_PUBLIC_BASE: `http://localhost:${devPort()}/api/emulator-storage` },
});
child.on('exit', (code) => process.exit(code ?? 0));
