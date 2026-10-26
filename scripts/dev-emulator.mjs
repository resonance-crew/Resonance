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

// Loopback only: against the emulators the server takes unsigned ID tokens
// (FIREBASE_AUTH_EMULATOR_HOST), so nothing on the network may reach it. Bound
// by the name `localhost` (Next's middleware rewrites go to the origin a page
// was asked by, and must find the server itself there), resolved to IPv4 first:
// the Android emulator reaches the host's 127.0.0.1 at 10.0.2.2, the simulators
// and browsers reach localhost.
const hostname = args.some((a) => a === '--hostname' || a === '-H' || a.startsWith('--hostname=')) ? [] : ['--hostname', 'localhost'];
const nodeOptions = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' ');
const child = spawn('npx', ['next', 'dev', ...hostname, ...args], {
  stdio: 'inherit',
  env: { ...process.env, ...emulatorEnv, NODE_OPTIONS: nodeOptions, R2_PUBLIC_BASE: `http://localhost:${devPort()}/api/emulator-storage` },
});
child.on('exit', (code) => process.exit(code ?? 0));
