/**
 * ULIDs (the ulid spec): 48 bits of milliseconds and 80 of randomness in
 * Crockford's base32, 26 characters that sort as their time. Monotonic
 * within one process: ids made in the same millisecond (or with a clock
 * that went back) still sort in the order they were made — the outbox's
 * `changeLog/{ulid}` order.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(ms: number): string {
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function randomDigits(): number[] {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b % 32);
}

/** Add one to the base32 digits (the spec's monotonic increment). */
function increment(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i] < 31) {
      next[i]++;
      return next;
    }
    next[i] = 0;
  }
  return randomDigits();
}

export function ulid(now: number = Date.now()): string {
  const time = Math.max(now, lastTime);
  lastRandom = time === lastTime ? increment(lastRandom) : randomDigits();
  lastTime = time;
  return encodeTime(time) + lastRandom.map((d) => ALPHABET[d]).join('');
}

/** The milliseconds a ULID was made at. */
export function ulidTime(id: string): number {
  let ms = 0;
  for (const ch of id.slice(0, 10)) ms = ms * 32 + ALPHABET.indexOf(ch);
  return ms;
}
