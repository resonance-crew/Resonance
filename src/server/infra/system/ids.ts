import type { IdGenerator } from '@/server/ports/ids';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 20 characters of ALPHABET, as Firestore's own auto ids (rejection-sampled: every character equally likely). */
export function autoId(): string {
  let out = '';
  while (out.length < 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    for (const b of bytes) {
      // 248 = 62 × 4: the bytes above it would favour the first characters.
      if (b < 248 && out.length < 20) out += ALPHABET[b % 62];
    }
  }
  return out;
}

/** Ids from the platform's crypto. */
export const systemIds: IdGenerator = {
  id: autoId,
  uuid: () => crypto.randomUUID(),
};
