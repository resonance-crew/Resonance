/**
 * The language and image models (src/lib/ai/openai.ts today). Every call
 * takes a `signal` — `AbortSignal.timeout(ms)` — and it is required here:
 * zero-exception rule 9, every model call has a timeout. Only server routes
 * pinned to `hnd1` reach it (regions.test.ts).
 */

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

/** What a call cost, in tokens. */
export interface LlmUsage {
  input: number;
  output: number;
  /** Of `output`, the model's reasoning. */
  reasoning: number;
}

export interface LlmCall {
  /** Abandons the call; the promise rejects with the signal's reason. */
  signal: AbortSignal;
  model?: string;
  /** Caps the reply, reasoning included. */
  maxTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /** Told what the call spent (also when its answer is refused or cut short). */
  onUsage?: (usage: LlmUsage) => void;
}

/** A JSON Schema the answer must follow (strict structured output). */
export interface LlmJsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface LlmImageCall {
  signal: AbortSignal;
  size?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  /** In-progress previews to stream (0–3); with `onPartial` only. */
  partialImages?: number;
}

export interface LlmProvider {
  /** A chat completion's text. */
  chat(messages: LlmMessage[], opts: LlmCall): Promise<string>;
  /** A chat completion parsed as JSON (any object, or one following `jsonSchema`). */
  json<T = unknown>(messages: LlmMessage[], opts: LlmCall & { jsonSchema?: LlmJsonSchema }): Promise<T>;
  /** One embedding per text, unit length. */
  embed(texts: string[], opts: Pick<LlmCall, 'signal' | 'model' | 'onUsage'>): Promise<number[][]>;
  /** One image's bytes; with `onPartial`, streamed previews (base64) first. */
  image(prompt: string, opts: LlmImageCall, onPartial?: (b64: string, index: number) => void): Promise<Uint8Array>;
}
