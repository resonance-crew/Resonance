import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatIncomplete, EMBED_DIMENSIONS, IMAGE_TIMEOUT_MS, chatJSON, embed, generateImage, selectModel, signatureModel, type TokenUsage } from './openai';

// The low-level OpenAI helpers (round 26 §A1.3, D5): Structured Outputs and
// reasoning models. A reasoning model spends its thinking from the reply's
// cap, and Structured Outputs says outright when it won't answer — so a reply
// is read for how it ended, never just JSON.parse'd: a story about a loss
// must not silently lose its reading to an empty string.

const requests: { url: string; body: Record<string, unknown>; signal: AbortSignal | null | undefined }[] = [];
let answer: Record<string, unknown> = {};

beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
      return new Response(JSON.stringify(answer), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const completion = (message: Record<string, unknown>, finish = 'stop') => ({
  choices: [{ finish_reason: finish, message }],
  usage: { prompt_tokens: 1200, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 700 } },
});
const schema = { name: 'card_reading', schema: { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string' } } } };

describe('chatJSON', () => {
  it('asks for a strict schema, a reasoning effort and a cap that covers the thinking, and reads a finished answer', async () => {
    answer = completion({ content: '{"a":"一場雨"}' });
    const usage: TokenUsage[] = [];
    const out = await chatJSON([{ role: 'user', content: 'x' }], {
      model: 'gpt-6.2-sol',
      jsonSchema: schema,
      reasoningEffort: 'medium',
      maxTokens: 16_000,
      onUsage: (u) => usage.push(u),
    });
    expect(out).toEqual({ a: '一場雨' });
    expect(requests[0].body).toMatchObject({
      model: 'gpt-6.2-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 16_000,
      response_format: { type: 'json_schema', json_schema: { name: 'card_reading', strict: true, schema: schema.schema } },
    });
    expect(usage).toEqual([{ input: 1200, output: 900, reasoning: 700 }]);
  });

  it('keeps json_object without a schema, and sends no reasoning effort unless asked', async () => {
    answer = completion({ content: '{"ok":true}' });
    await chatJSON([{ role: 'user', content: 'x' }]);
    expect(requests[0].body.response_format).toEqual({ type: 'json_object' });
    expect(requests[0].body).not.toHaveProperty('reasoning_effort');
  });

  it("throws ChatIncomplete('length') for a reply cut at its cap — thinking that used it all — never a parse error", async () => {
    answer = completion({ content: '' }, 'length');
    const usage: TokenUsage[] = [];
    const error = await chatJSON([{ role: 'user', content: 'x' }], { jsonSchema: schema, onUsage: (u) => usage.push(u) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatIncomplete);
    expect((error as ChatIncomplete).kind).toBe('length');
    // What it cost is still told.
    expect(usage).toHaveLength(1);
  });

  it("throws ChatIncomplete('refusal') when the model declines, with its words", async () => {
    answer = completion({ content: null, refusal: "I can't help with that." });
    const error = await chatJSON([{ role: 'user', content: 'x' }], { jsonSchema: schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatIncomplete);
    expect(error).toMatchObject({ kind: 'refusal', detail: "I can't help with that." });
    answer = completion({ content: '' }, 'content_filter');
    await expect(chatJSON([{ role: 'user', content: 'x' }])).rejects.toMatchObject({ kind: 'refusal' });
  });

  it('still throws on a reply that is not JSON, and on an error status', async () => {
    answer = completion({ content: 'not json' });
    await expect(chatJSON([{ role: 'user', content: 'x' }])).rejects.toThrow(SyntaxError);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    await expect(chatJSON([{ role: 'user', content: 'x' }])).rejects.toThrow('OpenAI chat failed: 503 busy');
  });
});

describe('the models', () => {
  it('reads the card reading and the select from settings of their own, never the slug model', () => {
    expect(signatureModel()).toBe('gpt-6.2-sol');
    expect(selectModel()).toBe('gpt-6.1-terra');
    vi.stubEnv('OPENAI_SIGNATURE_MODEL', 'gpt-6.1-terra');
    vi.stubEnv('OPENAI_SELECT_MODEL', 'gpt-6-luna');
    vi.stubEnv('OPENAI_LLM_MODEL', 'gpt-5.4-mini');
    expect(signatureModel()).toBe('gpt-6.1-terra');
    expect(selectModel()).toBe('gpt-6-luna');
  });
});

describe('embed', () => {
  it('asks a third-generation model for the index’s 1536 dimensions, and tells its tokens', async () => {
    answer = { data: [{ embedding: [3, 4] }], usage: { prompt_tokens: 42 } };
    const usage: TokenUsage[] = [];
    expect(await embed(['a'], { model: 'text-embedding-3-large', onUsage: (u) => usage.push(u) })).toEqual([[0.6, 0.8]]);
    expect(requests[0].body).toEqual({ model: 'text-embedding-3-large', input: ['a'], dimensions: EMBED_DIMENSIONS });
    expect(usage).toEqual([{ input: 42, output: 0, reasoning: 0 }]);
  });
});

describe('generateImage', () => {
  it('carries a timeout (zero-exception 9), IMAGE_TIMEOUT_MS when the caller gives none', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    answer = { data: [{ b64_json: Buffer.from('png').toString('base64') }] };
    await generateImage('a quiet room');
    expect(timeout).toHaveBeenCalledWith(IMAGE_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });
});
