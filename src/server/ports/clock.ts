/** The time, injectable: a service asks `ctx.clock`, never `Date.now()`, so a test can hold it still. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
  /** The same moment as a Date. */
  date(): Date;
}
