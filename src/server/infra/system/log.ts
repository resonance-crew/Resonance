import type { Logger } from '@/server/ports/log';

/** The console, which Vercel collects. */
export const consoleLogger: Logger = {
  info: (message, ...rest) => console.info(message, ...rest),
  warn: (message, ...rest) => console.warn(message, ...rest),
  error: (message, ...rest) => console.error(message, ...rest),
};
