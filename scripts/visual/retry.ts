/**
 * A device step that gave no answer, tried again once after the device is restarted. A simulator whose
 * CoreSimulator stopped answering keeps `simctl bootstatus` waiting for ever, and an AVD can hang half
 * booted: before this, a run sat 2 h 16 min on one (2026-11-22), holding every lock while other runs
 * queued behind it. Only a timeout ([CommandTimeout]) is tried again; any other failure is a real one
 * and goes up as it is.
 */
import { CommandTimeout } from './util';

export async function withRestart<T>(
  what: string,
  attempt: () => Promise<T>,
  restart: () => Promise<void> | void,
  { tries = 2, log = console.log }: { tries?: number; log?: (line: string) => void } = {},
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof CommandTimeout) || i >= tries) throw error;
      log(`  ${what}: ${error.message} — restarting it and trying again (${i + 1} of ${tries})`);
      await restart();
    }
  }
}
