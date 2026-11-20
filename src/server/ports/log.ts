/**
 * Server logs. Lines keep today's `[area]` prefixes (`[push]`,
 * `[recommend]`…), which Vercel's log search is used with.
 */
export interface Logger {
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
}
