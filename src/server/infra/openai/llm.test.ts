import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAiLlm } from './llm';

// The LlmProvider over OpenAI: each call goes out with the caller's signal
// (rule 9) and refuses to go out without one; and the raw client is reached
// only through src/lib/ai/openai.ts, the file regions.test.ts follows
// routes' imports to.

const requests: { url: string; body: Record<string, unknown>; signal: AbortSignal | null | undefined }[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('OPENAI_API_KEY', 'sk-test');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
      if (url.endsWith('/embeddings')) return Response.json({ data: [{ embedding: [3, 4] }], usage: { prompt_tokens: 2 } });
      if (url.endsWith('/images/generations')) return Response.json({ data: [{ b64_json: Buffer.from([1, 2]).toString('base64') }] });
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: ' {"ok":true} ' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('openAiLlm', () => {
  it('passes every call the signal it is given', async () => {
    const llm = openAiLlm();
    const signal = AbortSignal.timeout(5_000);
    const usage = vi.fn();
    expect(await llm.chat([{ role: 'user', content: 'hi' }], { signal, maxTokens: 10 })).toBe('{"ok":true}');
    expect(await llm.json([{ role: 'user', content: 'hi' }], { signal, onUsage: usage })).toEqual({ ok: true });
    expect(usage).toHaveBeenCalledWith({ input: 5, output: 3, reasoning: 0 });
    expect(await llm.embed(['a'], { signal })).toEqual([[0.6, 0.8]]);
    expect(await llm.image('a lamp', { signal, quality: 'low' })).toEqual(new Uint8Array([1, 2]));
    expect(requests.map((r) => r.signal)).toEqual([signal, signal, signal, signal]);
    expect(requests[0].body).toMatchObject({ max_completion_tokens: 10 });
    expect(requests[1].body).toMatchObject({ response_format: { type: 'json_object' } });
  });

  it('never calls the model without a signal', async () => {
    const llm = openAiLlm();
    const untyped = llm as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    await expect(untyped.chat([], {})).rejects.toThrow(/needs a signal/);
    await expect(untyped.json([], undefined)).rejects.toThrow(/needs a signal/);
    await expect(untyped.embed(['a'], {})).rejects.toThrow(/needs a signal/);
    await expect(untyped.image('p', {})).rejects.toThrow(/needs a signal/);
    expect(requests).toEqual([]);
  });
});

describe('the raw OpenAI client', () => {
  it('is imported only by its facade src/lib/ai/openai.ts (what regions.test.ts follows imports to)', () => {
    const src = join(__dirname, '../../..');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
    })(src);
    const importers = files
      .map((f) => ({ f: relative(src, f), source: readFileSync(f, 'utf8') }))
      .filter(({ f, source }) => /infra\/openai\/client['"]/.test(source) || (f.startsWith('server/infra/openai/') && /['"]\.\/client['"]/.test(source)))
      .map(({ f }) => f)
      .filter((f) => f !== 'server/infra/openai/llm.test.ts');
    expect(importers).toEqual(['lib/ai/openai.ts']);
  });
});
