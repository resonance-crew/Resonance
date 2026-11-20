/**
 * Low-level OpenAI REST helpers. Server-only (uses OPENAI_API_KEY). The raw
 * fetch client lives in the middle layer now (src/server/infra/openai/client.ts);
 * this path stays its one door: every caller imports from here (or takes the
 * LlmProvider, src/server/infra/openai/llm.ts, which comes through here), so
 * src/lib/ai/regions.test.ts, which follows imports to this file, still finds
 * every route that reaches OpenAI.
 */
export * from '@/server/infra/openai/client';
