import type { PushGateway, PushMessage, PushOutcome } from '@/server/ports/push';

/** A gateway that keeps every send instead of making it; `dead` tokens come back refused. */
export interface MemoryPush extends PushGateway {
  readonly sends: { tokens: string[]; message: PushMessage }[];
  /** Tokens the "service" refuses from now on, as never deliverable again. */
  readonly dead: Set<string>;
  /** Make the next `send` throw this (once). */
  failNext(error: Error): void;
}

export function memoryPush(dead: Iterable<string> = []): MemoryPush {
  const sends: { tokens: string[]; message: PushMessage }[] = [];
  const refused = new Set(dead);
  let failure: Error | null = null;
  return {
    sends,
    dead: refused,
    failNext: (error) => void (failure = error),
    async send(tokens, message): Promise<PushOutcome> {
      if (failure) {
        const e = failure;
        failure = null;
        throw e;
      }
      sends.push({ tokens: [...tokens], message: structuredClone(message) });
      const gone = tokens.filter((t) => refused.has(t));
      return { sent: tokens.length - gone.length, dead: gone };
    },
  };
}
