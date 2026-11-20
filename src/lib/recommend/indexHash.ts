import { createHash } from 'node:crypto';
import { readingText } from '@/lib/ai/tasks';
import { embedModel, signatureModel } from '@/lib/ai/openai';
import { modelsOffline } from '@/lib/text/translation';
import { OFFLINE_MODEL } from './offline';

/**
 * What a card's reading is made from and by which models: the recipe's
 * version, the models the index holds now and the hash of a card's text
 * (lib/recommend/indexCard, src/server/app/recommendIndex.ts). No I/O.
 */

/** The recipe's version: bumped when the reading's or the vectors' recipe changes, so every card is read again. */
export const INDEX_VERSION = 3;

/** The embedding model the index holds now: the emulators' stand-in under them (§A1.9). */
export function currentEmbedModel(): string {
  return modelsOffline() ? OFFLINE_MODEL : embedModel();
}
/** The reading model the index holds now. */
export function currentReadingModel(): string {
  return modelsOffline() ? OFFLINE_MODEL : signatureModel();
}

/**
 * What a card's reading and vectors were made from: the text the reading
 * reads (readingText), with the models and the recipe's version — a card
 * whose hash is unchanged would get the same reading and vectors again.
 */
export function indexContentHash(title: string, story: string): string {
  return createHash('sha256')
    .update(JSON.stringify([INDEX_VERSION, currentReadingModel(), currentEmbedModel(), readingText({ title, story })]))
    .digest('base64url');
}
