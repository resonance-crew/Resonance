import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { embed, IMAGE_TIMEOUT_MS } from './openai';
import {
  CONCEPT_TIMEOUT_MS,
  READING_MAX_CHARS,
  READING_MAX_TOKENS,
  READING_PROMPT,
  generateStoryImage,
  insightsLine,
  readCard,
  readingText,
  fullReadingChars,
  storyUnits,
  SLUG_MAX_TOKENS,
  SLUG_TIMEOUT_MS,
  suggestStoryTags,
  TAGS_TIMEOUT_MS,
  titleToSlugBase,
} from './tasks';
import { LONG_STORY_UNITS, SHORT_STORY_UNITS } from '@/lib/recommend/signature';
import { SUMMARY_TRANSLATE_TIMEOUT_MS, TRANSLATE_PIECE_TIMEOUT_MS, translateStory, translateSummary } from './translate';

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
        : /json_object|json_schema/.test(String(init.body))
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

  it('ask nothing for a title already in Latin script: its own words are the slug (B10)', async () => {
    expect(await titleToSlugBase('  A Quiet Night, After the Rain — Café ')).toBe('a-quiet-night-after-the-rain');
    expect(await titleToSlugBase('Été 2026')).toBe('ete-2026');
    expect(requests).toHaveLength(0);
    // Any other script (or digits alone) still goes to the model.
    expect(await titleToSlugBase('雨後 rain')).toBe('after-the-rain');
    expect(await titleToSlugBase('2026')).toBe('after-the-rain');
    expect(requests).toHaveLength(2);
  });

  it('abandon tag suggestions past TAGS_TIMEOUT_MS', async () => {
    await suggestStoryTags({ title: 't', story: 's', existingTags: [], historyTags: [] });
    expect(timeout).toHaveBeenCalledWith(TAGS_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("abandon the card reading with the caller's deadline", async () => {
    const deadline = AbortSignal.timeout(100_000);
    await readCard({ title: 't', story: 's' }, { signal: deadline });
    expect(requests[0].signal).toBe(deadline);
  });

  it('abandon an illustration: its concept past CONCEPT_TIMEOUT_MS, the image past IMAGE_TIMEOUT_MS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
        const body = url.endsWith('/images/generations')
          ? { data: [{ b64_json: Buffer.from('png').toString('base64') }] }
          : { choices: [{ message: { content: 'a lamp in the rain' } }] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    await generateStoryImage('It rained all night.');
    expect(timeout).toHaveBeenCalledWith(CONCEPT_TIMEOUT_MS);
    expect(timeout).toHaveBeenCalledWith(IMAGE_TIMEOUT_MS);
    expect(requests.every((r) => r.signal instanceof AbortSignal)).toBe(true);
  });

  it("abandon a story's translation piece past TRANSLATE_PIECE_TIMEOUT_MS, and a title's and excerpt's past SUMMARY_TRANSLATE_TIMEOUT_MS (round 25)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
        const content = JSON.stringify({ title: 'After the rain', text: 'It rained.', en: { title: 'After the rain', excerpt: 'It rained.' } });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }),
    );
    await translateStory({ title: '雨後', story: '下了雨。' }, 'en');
    expect(timeout).toHaveBeenCalledWith(TRANSLATE_PIECE_TIMEOUT_MS);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(requests[0].body.max_completion_tokens).toBeGreaterThan(0);
    await translateSummary({ title: '雨後', excerpt: '下了雨。' }, ['en']);
    expect(timeout).toHaveBeenCalledWith(SUMMARY_TRANSLATE_TIMEOUT_MS);
    expect(requests[1].signal).toBeInstanceOf(AbortSignal);
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

// Round 26 §A1: the card reading — the whole story, a reasoning model, Structured Outputs, and a story the model
// won't read falling back to the older prompt rather than losing its reading.
describe('readCard', () => {
  const reading = {
    facts: { events: 'e', particulars: ['巷口'], turn: 't' },
    insights: [{ span: '雨停', situation: '下雨的巷口', struggle: '迷路', thinking: '想回家', gain: '慢下來', shift: '急 → 慢', insight: '踩著水窪回家', reader: '剛搬家的人', evidence: '雨停的時候', strength: 0.8 }],
    through_line: '雨後的巷口',
    mood_only: false,
    insight_score: 0.7,
    life_domain: '日常',
    emotional_register: '平靜',
    placeholder: false,
  };
  const answering = (contents: unknown[]) => {
    const queue = [...contents];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
        const next = queue.shift();
        const message = next === 'refuse' ? { content: null, refusal: 'no' } : { content: JSON.stringify(next) };
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message }] }), { status: 200 });
      }),
    );
  };

  it('reads the story on the signature model, reasoning medium, to a strict schema with room to think', async () => {
    answering([reading]);
    const result = await readCard({ title: '雨後', story: '雨停的時候，**巷口**的積水映出路燈。' });
    expect(result).toMatchObject({ model: 'gpt-6.2-sol', error: null, reading: { throughLine: '雨後的巷口', insightScore: 0.7 } });
    expect(result.reading.insights[0]).toMatchObject({ situation: '下雨的巷口', shift: '急 → 慢', evidence: '雨停的時候' });
    const body = requests[0].body as { model: string; reasoning_effort: string; max_completion_tokens: number; response_format: { type: string; json_schema: { strict: boolean } }; messages: { content: string }[] };
    expect(body.model).toBe('gpt-6.2-sol');
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_completion_tokens).toBe(READING_MAX_TOKENS);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    // The story's plain text, not its Markdown.
    expect(body.messages.at(-1)!.content).toBe('雨後\n\n雨停的時候，巷口的積水映出路燈。');
  });

  it("asks the older prompt once, on the slug's model, when the reading model refuses — and says so", async () => {
    answering(['refuse', { core_insight: '學會慢下來', situation: '雨夜', insight_score: 0.6, life_domain: '日常' }]);
    const result = await readCard({ title: '失去', story: '那年冬天她走了。' });
    expect(result.error).toBe('refusal');
    expect(result.model).toBe('gpt-5.4-mini-2026-03-17');
    expect(result.reading).toMatchObject({ throughLine: '學會慢下來', insightScore: 0.6, moodOnly: false });
    expect(result.reading.insights).toEqual([expect.objectContaining({ insight: '學會慢下來', situation: '雨夜', strength: 0.6 })]);
    expect(requests).toHaveLength(2);
    expect(requests[1].body.model).toBe('gpt-5.4-mini-2026-03-17');
    expect(requests[1].body.response_format).toEqual({ type: 'json_object' });
  });

  it('asks again without the formula phrasings an earlier answer used, when told to (the cron and the backfill)', async () => {
    answering([reading]);
    await readCard({ title: 't', story: 's' }, { avoid: ['真正', 'not X but Y'] });
    const messages = requests[0].body.messages as { role: string; content: string }[];
    expect(messages).toContainEqual({ role: 'system', content: expect.stringContaining('真正, not X but Y') });
    expect(messages.at(-1)!.role).toBe('user');
  });

  // The bake-off (2026-11-19): left to choose, stories of 800–1 400 characters were read into two or three insights.
  it("tells the model how many insights the story's length allows, and keeps no more than that", async () => {
    const three = { ...reading, insights: [0.6, 0.9, 0.7].map((strength, k) => ({ ...reading.insights[0], insight: `第${k + 1}段`, strength })) };
    const lines = () => (requests.at(-1)!.body.messages as { role: string; content: string }[]).filter((m) => m.role === 'system').map((m) => m.content);

    answering([three]);
    const short = await readCard({ title: '雨後', story: '雨停的時候，巷口的積水映出路燈。' });
    expect(lines()).toContain(insightsLine(1));
    expect(short.reading.insights.map((i) => i.insight)).toEqual(['第2段']);

    answering([three]);
    const middle = await readCard({ title: '雨後', story: '雨'.repeat(SHORT_STORY_UNITS) });
    expect(lines()).toContain(insightsLine(2));
    expect(middle.reading.insights.map((i) => i.insight)).toEqual(['第2段', '第3段']);

    answering([three]);
    // Counted on the whole story, past what the reading reads of a long one; English by its words.
    const long = await readCard({ title: 'Rain', story: 'rain '.repeat(LONG_STORY_UNITS) });
    expect(storyUnits('rain '.repeat(LONG_STORY_UNITS))).toBe(LONG_STORY_UNITS);
    expect(lines()).toContain(insightsLine(3));
    expect(long.reading.insights).toHaveLength(3);
    expect(insightsLine(1)).not.toMatch(/one sentence/i);
  });

  it('reads the whole story up to READING_MAX_CHARS, and both ends of a longer one', () => {
    const story = `${'開頭。'.repeat(2000)}${'中間。'.repeat(20_000)}結尾的轉折。`;
    const text = readingText({ title: '長篇', story });
    expect(text.length).toBeLessThanOrEqual(READING_MAX_CHARS);
    expect(text.startsWith('長篇\n\n開頭。')).toBe(true);
    expect(text.endsWith('結尾的轉折。')).toBe(true);
    expect(text).toContain('……');
    const short = '一段不長的故事。'.repeat(100);
    expect(readingText({ title: 't', story: short })).toBe(`t\n\n${short}`);
    // Uncut, the whole of it is read: its Markdown is no part of its length (the reports counted every story cut).
    const marked = `**${short}** [連結](https://example.com)`;
    expect(fullReadingChars({ title: 't', story: marked })).toBe(readingText({ title: 't', story: marked }).length);
    expect(fullReadingChars({ title: '長篇', story })).toBeGreaterThan(readingText({ title: '長篇', story }).length);
  });

  it("holds none of the lines that asked for a saying, and asks the model to check for formula phrasings itself", () => {
    expect(READING_PROMPT).not.toMatch(/one sentence|the \*?lesson\*?, not the events|similar (core_insight )?wording/i);
    for (const phrase of ['真正的', '不是……而是……', '往往', 'the real', 'not X but Y']) expect(READING_PROMPT).toContain(phrase);
    // The matching fields in one language, whatever the story's.
    expect(READING_PROMPT).toContain('Traditional Chinese');
  });

  // The bake-off (2026-11-19): through lines that gave the title back, small inventions, 他/她 the story never
  // gave, and semicolons.
  it('asks for a through line the title does not already say, nothing the story does not say, no gender it does not give, no semicolons', () => {
    expect(READING_PROMPT).toMatch(/first line is its title[^\n]*never repeat it/);
    expect(READING_PROMPT).toMatch(/Write only what the story says/);
    expect(READING_PROMPT).toMatch(/never 他 or 她 \(he or she\) for the author unless the story says which/);
    expect(READING_PROMPT).toMatch(/No semicolons/);
    // The second bake-off: through lines that named a side detail, a lifted sentence or only the problem.
    expect(READING_PROMPT).toMatch(/where the author lands[^\n]*Not a closing remark, one technique or episode, a sentence lifted from the story, or only the problem/);
  });
});
