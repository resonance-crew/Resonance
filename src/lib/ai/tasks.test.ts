import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { embed } from './openai';
import { extractInsightSignature, SIGNATURE_TIMEOUT_MS, SLUG_MAX_TOKENS, SLUG_TIMEOUT_MS, suggestStoryTags, TAGS_TIMEOUT_MS, titleToSlugBase } from './tasks';

// Every OpenAI call carries a timeout (CLAUDE.md, AI): one that hangs must
// not hold a function — publishing's slug, the writer's tag suggestions, the
// index after a save — until its maxDuration. The slug's reply is capped too.

const requests: { url: string; body: Record<string, unknown>; signal: AbortSignal | null | undefined }[] = [];
let timeout: MockInstance<(milliseconds: number) => AbortSignal>;

beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  timeout = vi.spyOn(AbortSignal, 'timeout');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
      const content = url.endsWith('/embeddings')
        ? null
        : String(init.body).includes('json_object')
          ? JSON.stringify({ core_insight: 'x', insight_score: 0.5 })
          : 'after the rain';
      const body = url.endsWith('/embeddings') ? { data: [{ embedding: [3, 4] }] } : { choices: [{ message: { content } }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('OpenAI calls', () => {
  it("abandon the slug's call past SLUG_TIMEOUT_MS and cap its reply", async () => {
    expect(await titleToSlugBase('雨後')).toBe('after-the-rain');
    expect(timeout).toHaveBeenCalledWith(SLUG_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(requests[0].body.max_completion_tokens).toBe(SLUG_MAX_TOKENS);
  });

  it('abandon tag suggestions past TAGS_TIMEOUT_MS', async () => {
    await suggestStoryTags({ title: 't', story: 's', existingTags: [], historyTags: [] });
    expect(timeout).toHaveBeenCalledWith(TAGS_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('abandon the insight signature past SIGNATURE_TIMEOUT_MS', async () => {
    await extractInsightSignature({ title: 't', story: 's' });
    expect(timeout).toHaveBeenCalledWith(SIGNATURE_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('pass an embedding call the signal it is given', async () => {
    const signal = AbortSignal.timeout(1_000);
    expect(await embed(['a'], { signal })).toEqual([[0.6, 0.8]]);
    expect(requests[0].signal).toBe(signal);
  });

  it('reject when the timeout fires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => {
            if (init.signal?.aborted) reject(init.signal.reason);
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    timeout.mockImplementation(() => AbortSignal.abort(new DOMException('timed out', 'TimeoutError')));
    await expect(titleToSlugBase('雨後')).rejects.toThrow('timed out');
  });
});
