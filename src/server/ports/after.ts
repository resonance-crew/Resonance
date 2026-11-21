/**
 * Work run after the response is sent (Next's `after()` today; a queue
 * later). It never delays or fails the request that scheduled it: a failure
 * is logged under `label` and goes no further.
 */
export interface AfterResponse {
  later(fn: () => unknown | Promise<unknown>, label: string): void;
  /**
   * `fn` after the response while one is being answered (resolving at once), else now, awaited — for best-effort
   * follow-ups such as signal touches that must not slow an answer, yet still run where no request is (a script, a
   * test calling a service). Never rejects: a failure is logged under `label`.
   */
  soon(fn: () => unknown | Promise<unknown>, label: string): Promise<void>;
}
