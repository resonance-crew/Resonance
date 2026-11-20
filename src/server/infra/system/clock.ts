import type { Clock } from '@/server/ports/clock';

/** The machine's clock. */
export const systemClock: Clock = {
  now: () => Date.now(),
  date: () => new Date(),
};
