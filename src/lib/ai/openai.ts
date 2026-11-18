/**
 * Low-level OpenAI REST helpers. Server-only (uses OPENAI_API_KEY). We call the
 * REST endpoints with `fetch` directly so the app pulls in no extra SDK weight.
 */

const API_BASE = 'https://api.openai.com/v1';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

export function llmModel(): string {
  return process.env.OPENAI_LLM_MODEL ?? 'gpt-5.4-mini-2026-03-17';
}

export function imageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
}

export function embedModel(): string {
  return process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small';
}

/**
 * The publish panel's mirror (mirrorInsight): one sentence that has to catch
 * what a story leaves unsaid, which the mini model too often missed or
 * flattened into a saying. Its own setting, so it can change alone.
 */
export function mirrorModel(): string {
  return process.env.OPENAI_MIRROR_MODEL ?? 'gpt-5.6-terra';
}

/** Cheap model used for the recommendation funnel's batch rerank stage. */
export function rerankModel(): string {
  return process.env.OPENAI_RERANK_MODEL ?? 'gpt-5.4-mini-2026-03-17';
}

/**
 * The card reading (round 26 §A1: lib/ai/tasks readCard): the whole story,
 * read for what happened, how the author thought, what they gained and what
 * changed — a reasoning model, its own setting. Never `llmModel()`, whose
 * slug cap (SLUG_MAX_TOKENS) a reasoning model's thinking would spend.
 * The default is the round's first choice until the owner's pick after the
 * bake-off (scripts/recommend/dryrun.ts) is set in OPENAI_SIGNATURE_MODEL.
 */
export function signatureModel(): string {
  return process.env.OPENAI_SIGNATURE_MODEL ?? 'gpt-6.2-sol';
}

/** The funnel's last step (lib/recommend/select): the reader's 8 and a line each. A reasoning model, asked to think a little. */
export function selectModel(): string {
  return process.env.OPENAI_SELECT_MODEL ?? 'gpt-6.1-terra';
}

/** The dimensions every stored vector has: the index (firestore.indexes.json `cardVectors`) is built for 1536. */
export const EMBED_DIMENSIONS = 1536;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** What a call cost, in tokens, as OpenAI counts them. */
export interface TokenUsage {
  input: number;
  output: number;
  /** Of `output`, the model's reasoning (0 for a model that doesn't reason). */
  reasoning: number;
}

export interface ChatOptions {
  model?: string;
  /** Abandons the call (e.g. `AbortSignal.timeout(ms)`): the promise rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Caps the reply, reasoning included (`max_completion_tokens`). */
  maxTokens?: number;
  /** How much a reasoning model thinks first (`reasoning_effort`); left out, the model's own default. */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /** Told what the call spent (also when its answer is then refused or cut short). */
  onUsage?: (usage: TokenUsage) => void;
}

/**
 * A JSON Schema the answer must follow (Structured Outputs, `strict`): every
 * property listed in `required`, `additionalProperties: false` on every
 * object, an optional value written as a `null` union. Lengths are not held
 * by `strict`: the caller still trims what it keeps.
 */
export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatJSONOptions extends ChatOptions {
  /** Without it, any JSON object (`json_object`). */
  jsonSchema?: JsonSchemaFormat;
}

/**
 * A completion that ended without an answer to read: `length` (the cap ran
 * out, a reasoning model's thinking included — the content is empty or cut)
 * or `refusal` (the model declined, which Structured Outputs says outright).
 * A caller records which (cardSignatures.error) and may ask differently.
 */
export class ChatIncomplete extends Error {
  constructor(
    readonly kind: 'length' | 'refusal',
    readonly detail: string,
  ) {
    super(`OpenAI chat ended without an answer: ${kind}${detail ? ` (${detail})` : ''}`);
    this.name = 'ChatIncomplete';
  }
}

function chatBody(messages: ChatMessage[], opts: ChatOptions, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: opts.model ?? llmModel(),
    messages,
    ...(opts.maxTokens ? { max_completion_tokens: opts.maxTokens } : {}),
    ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
    ...extra,
  });
}

interface CompletionBody {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
}

function usageOf(data: CompletionBody): TokenUsage {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    input: n(data.usage?.prompt_tokens),
    output: n(data.usage?.completion_tokens),
    reasoning: n(data.usage?.completion_tokens_details?.reasoning_tokens),
  };
}

/** Single-turn chat completion; returns the assistant's trimmed text. */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: chatBody(messages, opts),
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return String(data.choices?.[0]?.message?.content ?? '').trim();
}

/**
 * Single-turn completion constrained to JSON: any object, or with
 * `jsonSchema` one that follows that schema (Structured Outputs, strict).
 * Returns the parsed object. Reads how the completion ended: a refusal or a
 * reply cut at the cap (`finish_reason: length`, which a reasoning model's
 * thinking can cause with nothing written yet) throws {@link ChatIncomplete},
 * never a JSON parse error; non-JSON otherwise throws as before. Used by the
 * structured tasks: the card reading, the funnel's rerank and select, the
 * mirror, translations.
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  opts: ChatJSONOptions = {}
): Promise<T> {
  const format = opts.jsonSchema
    ? { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema } }
    : { type: 'json_object' };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: chatBody(messages, opts, { response_format: format }),
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as CompletionBody;
  opts.onUsage?.(usageOf(data));
  const choice = data.choices?.[0];
  const refusal = choice?.message?.refusal;
  if (typeof refusal === 'string' && refusal.trim()) throw new ChatIncomplete('refusal', refusal.trim().slice(0, 200));
  if (choice?.finish_reason === 'content_filter') throw new ChatIncomplete('refusal', 'content_filter');
  if (choice?.finish_reason === 'length') throw new ChatIncomplete('length', '');
  const content = String(choice?.message?.content ?? '').trim();
  return JSON.parse(content) as T;
}

/**
 * Embed one or more texts. Returns **unit-normalized** vectors, so the vector
 * store's COSINE distance is 1 − their dot product (smaller = closer).
 * Server-only.
 */
export async function embed(
  texts: string[],
  opts: { signal?: AbortSignal; model?: string; onUsage?: (usage: TokenUsage) => void } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = opts.model ?? embedModel();
  const res = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    // The third generation can be asked for fewer dimensions: `3-large` at the index's 1536 (round 26 §A2.2).
    body: JSON.stringify({ model, input: texts, ...(model.startsWith('text-embedding-3') ? { dimensions: EMBED_DIMENSIONS } : {}) }),
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[]; usage?: { prompt_tokens?: number } };
  const tokens = data.usage?.prompt_tokens;
  opts.onUsage?.({ input: typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : 0, output: 0, reasoning: 0 });
  const rows = data.data ?? [];
  return rows.map((row) => normalizeVector(row.embedding ?? []));
}

/** L2-normalize a vector; a zero vector is returned unchanged. */
function normalizeVector(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

/**
 * How long an illustration may take, start to final image, before it is
 * abandoned (zero-exception 9: every OpenAI call carries a timeout). Inside
 * the illustration route's maxDuration (120), with room for the concept's
 * call before it and the upload after.
 */
export const IMAGE_TIMEOUT_MS = 90_000;

export interface ImageStreamOptions {
  size?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  /** How many in-progress previews to emit (0–3). */
  partialImages?: number;
  /** Abandons the call; IMAGE_TIMEOUT_MS when none is given. */
  signal?: AbortSignal;
}

/**
 * Generate one image with streaming: the API emits 1–3 in-progress previews
 * (`image_generation.partial_image` SSE events) before the final image. Each
 * partial's base64 payload is handed to `onPartial` as-is (the browser can use
 * it directly in a data URL — no decode/re-encode round trip); the resolved
 * value is the final image's raw bytes, same contract as {@link generateImage}.
 */
export async function generateImageStream(
  prompt: string,
  opts: ImageStreamOptions = {},
  onPartial?: (b64: string, index: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size: opts.size ?? '1536x1024',
      quality: opts.quality ?? 'low',
      stream: true,
      partial_images: opts.partialImages ?? 2,
    }),
    signal: opts.signal ?? AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
  }

  // Minimal SSE parse: events are separated by a blank line; the JSON payload
  // lives on `data:` lines and carries its own `type` discriminator.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalB64: string | undefined;

  const handleEvent = (raw: string) => {
    const data = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data) as {
      type?: string;
      b64_json?: string;
      partial_image_index?: number;
    };
    if (event.type === 'image_generation.partial_image' && event.b64_json) {
      onPartial?.(event.b64_json, event.partial_image_index ?? 0);
    } else if (event.type === 'image_generation.completed' && event.b64_json) {
      finalB64 = event.b64_json;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleEvent(raw);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  if (!finalB64) throw new Error('OpenAI image stream ended without a final image');
  return new Uint8Array(Buffer.from(finalB64, 'base64'));
}

/**
 * Generate one image from a prompt. Returns the raw PNG bytes (decoded from the
 * API's base64 payload) so the caller can stream it straight to storage.
 */
export async function generateImage(
  prompt: string,
  opts: { size?: string; quality?: 'low' | 'medium' | 'high' | 'auto'; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size: opts.size ?? '1536x1024',
      quality: opts.quality ?? 'low',
      n: 1,
    }),
    signal: opts.signal ?? AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image returned no data');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
