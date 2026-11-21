import type { LlmProvider } from '@/server/ports/llm';

// Through the facade, never ./client directly: src/lib/ai/regions.test.ts
// follows a route's imports (import() included) to src/lib/ai/openai.ts, so a
// route that passes openAiLlm() is seen reaching OpenAI and must be pinned to hnd1.
const openai = () => import('@/lib/ai/openai');

/** Zero-exception rule 9: every model call carries a timeout. The port's type requires it; this holds it for untyped callers too. */
function deadline(opts: { signal?: AbortSignal } | undefined, call: string): AbortSignal {
  if (!(opts?.signal instanceof AbortSignal)) throw new TypeError(`LlmProvider.${call} needs a signal (AbortSignal.timeout(ms)): every model call has a timeout`);
  return opts.signal;
}

/**
 * OpenAI by raw fetch (./client.ts, through src/lib/ai/openai), loaded on
 * first use. Every call carries the caller's signal (rule 9). Never in the
 * default context: a route pinned to hnd1 passes it —
 * `serverCtx({ llm: openAiLlm() })` (src/server/README.md).
 */
export function openAiLlm(): LlmProvider {
  return {
    chat: async (messages, opts) => {
      const signal = deadline(opts, 'chat');
      return (await openai()).chat(messages, { ...opts, signal });
    },
    json: async <T>(...[messages, opts]: Parameters<LlmProvider['json']>) => {
      const signal = deadline(opts, 'json');
      return (await openai()).chatJSON<T>(messages, { ...opts, signal });
    },
    embed: async (texts, opts) => {
      const signal = deadline(opts, 'embed');
      return (await openai()).embed(texts, { ...opts, signal });
    },
    image: async (prompt, opts, onPartial) => {
      const signal = deadline(opts, 'image');
      const ai = await openai();
      return onPartial ? ai.generateImageStream(prompt, { ...opts, signal }, onPartial) : ai.generateImage(prompt, { ...opts, signal });
    },
  };
}
