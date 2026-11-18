import { createHash } from 'node:crypto';
import type { CardReading } from '@/lib/db/types';
import { readingParts, type ReadingPart } from './signature';
import { normalize } from './math';

/**
 * The reading and the vectors a card gets under the emulators
 * (`modelsOffline()`, round 26 §A1.9): no OpenAI call from a dev server, a
 * screenshot run or a Maestro flow — none of their test cards' words leave
 * the machine, and nothing costs anything — and the emulator still has a
 * pool to match on. Everything here is derived from the card's id (and how
 * long its story is), the same on every run.
 */

/** The index's dimensions (openai.ts EMBED_DIMENSIONS; not imported, so nothing here reaches the OpenAI client). */
const EMBED_DIMENSIONS = 1536;
/** The model name an offline reading and its vectors are stored under. */
export const OFFLINE_MODEL = 'offline';
/**
 * The dimensions a fake vector varies in. Random directions in all 1536 are
 * all about equally far apart; in a few, some cards land near each other, so
 * the emulator's picks, cold start and film have something to tell apart.
 */
const SPREAD = 12;

/** A deterministic stream of numbers in [-1, 1) from a seed text. */
function stream(seed: string): () => number {
  const bytes = createHash('sha256').update(seed).digest();
  let state = bytes.readUInt32LE(0) ^ bytes.readUInt32LE(4);
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * A fake unit vector for one part of a card: the card's own direction, and
 * a little of the part's and the channel's, so a card's parts are near each
 * other and its two channels are not the same.
 */
export function offlineVector(cardId: string, part: Pick<ReadingPart, 'channel' | 'part'>): number[] {
  const card = stream(`card:${cardId}`);
  const own = stream(`part:${cardId}:${part.channel}:${part.part}`);
  const v = new Array<number>(EMBED_DIMENSIONS).fill(0);
  for (let i = 0; i < SPREAD; i++) v[i] = card() + 0.25 * own();
  return normalize(v);
}

/**
 * A fake reading: listed (score 0.8, not feeling only, not a placeholder),
 * one insight, or two for a longer story — written so a screen that shows it
 * (the author's own `coreInsight`) says plainly that no model read it.
 */
export function offlineReading(cardId: string, title: string, story: string): CardReading {
  const name = title.trim() || cardId;
  const insight = (n: number) => ({
    span: '',
    situation: `（離線）〈${name}〉的處境 ${n + 1}`,
    struggle: '（離線）',
    thinking: '（離線）',
    gain: '（離線）',
    shift: '',
    insight: `（離線）〈${name}〉的體悟 ${n + 1}`,
    reader: '',
    evidence: '',
    strength: 0.8,
  });
  return {
    insights: story.length > 400 ? [insight(0), insight(1)] : [insight(0)],
    throughLine: Array.from(`（離線）${name}`).slice(0, 60).join(''),
    moodOnly: false,
    insightScore: 0.8,
    lifeDomain: '日常',
    emotionalRegister: '平靜',
    placeholder: false,
  };
}

/** The offline reading's parts with their fake vectors. */
export function offlineEmbedding(cardId: string, reading: CardReading): { part: ReadingPart; vector: number[] }[] {
  return readingParts(reading).map((part) => ({ part, vector: offlineVector(cardId, part) }));
}
