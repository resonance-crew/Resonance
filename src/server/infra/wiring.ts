/**
 * Two ways the skeleton stands in for an adapter a wave-2 lane hasn't built.
 */

/** Thrown by a port no adapter is wired to yet. */
export class NotWiredError extends Error {
  constructor(port: string, method: string, hint?: string) {
    super(hint ? `ServerCtx.${port}.${method}: ${hint}` : `ServerCtx.${port} is not wired yet (called ${method}): its Phase 1 lane builds the adapter, or pass one in the ctx overrides`);
    this.name = 'NotWiredError';
  }
}

/**
 * A placeholder for a port: building and passing the context is fine, any
 * method called on it throws NotWiredError (with `hint` as its message, when given).
 */
export function notWired<T extends object>(port: string, hint?: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      // Never a thenable, so `await ctx.push` doesn't call it.
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return () => {
        throw new NotWiredError(port, String(prop), hint);
      };
    },
  });
}

/**
 * A port whose every method is asynchronous, delegating to an implementation
 * loaded on first call — so building a context imports no SDK, and a
 * delegating adapter makes no import cycle with the src/lib module it wraps
 * (which may later import @/server itself). A load that fails is tried again
 * on the next call.
 */
export function lazyAsync<T extends object>(load: () => Promise<T>): T {
  let loading: Promise<T> | null = null;
  const target = () => {
    loading ??= load().catch((e: unknown) => {
      loading = null;
      throw e;
    });
    return loading;
  };
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return async (...args: unknown[]) => {
        const impl = (await target()) as Record<string | symbol, unknown>;
        const method = impl[prop];
        if (typeof method !== 'function') throw new TypeError(`No method ${String(prop)} on the loaded adapter`);
        return (method as (...a: unknown[]) => unknown).apply(impl, args);
      };
    },
  });
}
