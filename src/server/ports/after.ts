/**
 * Work run after the response is sent (Next's `after()` today; a queue
 * later). It never delays or fails the request that scheduled it: a failure
 * is logged under `label` and goes no further.
 */
export interface AfterResponse {
  later(fn: () => unknown | Promise<unknown>, label: string): void;
}
