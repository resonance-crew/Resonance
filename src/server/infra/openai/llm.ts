import type { LlmProvider } from '@/server/ports/llm';

const openai = () => import('@/lib/ai/openai');

/**
 * OpenAI by raw fetch, by delegating to src/lib/ai/openai (loaded on first
 * use). Every call carries the caller's signal (rule 9). The LLM lane moves
 * the code here.
 */
export function openAiLlm(): LlmProvider {
  return {
    chat: async (messages, opts) => (await openai()).chat(messages, opts),
    json: async <T>(...[messages, opts]: Parameters<LlmProvider['json']>) => (await openai()).chatJSON<T>(messages, opts),
    embed: async (texts, opts) => (await openai()).embed(texts, opts),
    image: async (prompt, opts, onPartial) => {
      const ai = await openai();
      return onPartial ? ai.generateImageStream(prompt, opts, onPartial) : ai.generateImage(prompt, opts);
    },
  };
}
