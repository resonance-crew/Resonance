/**
 * The seed, kept loaded (stack.ts `Seeder`): started once with the stack's seed environment (`seedEnv`), it seeds the
 * whole test world again each time it reads a line `seed` on its stdin, and answers one line — `ok`, or `error <why>`.
 * The flows reseeded before every flow with `npx tsx scripts/seed-emulator.ts`: a new process loading the script, the
 * Admin SDK and what the seed imports each time (0.9–3.5 s a flow, run 20261123 measures). The world is the very
 * same one: `seedWorld` is the script's own body, the reset first (SEED_RESET=1).
 */
import { createInterface } from 'node:readline';

process.env.SEED_LIBRARY = '1';

async function main() {
  const { seedWorld } = await import('../seed-emulator');
  // Said once loaded, so the first seed's time is the seed's own.
  process.stdout.write('loaded\n');
  const lines = createInterface({ input: process.stdin });
  // One seed at a time, in the order asked.
  let queue = Promise.resolve();
  lines.on('line', (line) => {
    if (line.trim() !== 'seed') return;
    queue = queue.then(async () => {
      try {
        await seedWorld();
        process.stdout.write('ok\n');
      } catch (error) {
        process.stdout.write(`error ${JSON.stringify(String((error as Error)?.message ?? error))}\n`);
      }
    });
  });
  lines.on('close', () => void queue.then(() => process.exit(0)));
}

main().catch((error) => {
  process.stdout.write(`error ${JSON.stringify(String((error as Error)?.message ?? error))}\n`);
  process.exit(1);
});
