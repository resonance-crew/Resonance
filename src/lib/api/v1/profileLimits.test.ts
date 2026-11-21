import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_TRANSLATE_MAX, AVATAR_URL_MAX, BIO_MAX, HINT_COUNT_MAX, HINTS_SEEN_MAX, UpdateProfileRequest } from './schemas';

// PATCH /api/v1/me takes what a client's own `users/{uid}` write did under
// firestore.rules (validProfileChanges, storedFile), and the old builds keep
// writing it there — so the two limits stay the same numbers: these read
// them out of the rules.

const rules = readFileSync(resolve(__dirname, '../../../../firebase/firestore.rules'), 'utf8');
const profile = rules.slice(rules.indexOf('function validProfileChanges'), rules.indexOf('match /bookmarks/'));
const num = (re: RegExp, text = profile) => {
  const m = re.exec(text);
  expect(m, String(re)).not.toBeNull();
  return Number(m![1]);
};

describe("PATCH /me's limits are the rules'", () => {
  it('autoTranslateTo, hintsSeen, the bio and an avatar URL', () => {
    expect(num(/d\.autoTranslateTo\.size\(\) <= (\d+)/)).toBe(AUTO_TRANSLATE_MAX);
    expect(profile).toMatch(/d\.autoTranslateTo\.hasOnly\(\["en", "zh-TW"\]\)/);
    expect(num(/d\.hintsSeen\.size\(\) <= (\d+)/)).toBe(HINTS_SEEN_MAX);
    const counts = /d\.hintsSeen\.values\(\)\.hasOnly\(\[([\d, ]+)\]\)/.exec(profile)![1].split(',').map(Number);
    expect(counts).toEqual(Array.from({ length: HINT_COUNT_MAX + 1 }, (_, i) => i));
    expect(num(/d\.bio\.size\(\) <= (\d+)/)).toBe(BIO_MAX);
    expect(num(/url\.size\(\) <= (\d+)/, rules.slice(rules.indexOf('function storedFile')))).toBe(AVATAR_URL_MAX);
  });

  it('the request schema holds them', () => {
    expect(UpdateProfileRequest.safeParse({ autoTranslateTo: Array(AUTO_TRANSLATE_MAX).fill('en') }).success).toBe(true);
    expect(UpdateProfileRequest.safeParse({ autoTranslateTo: Array(AUTO_TRANSLATE_MAX + 1).fill('en') }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ autoTranslateTo: ['fr'] }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ hintsSeen: { a: HINT_COUNT_MAX } }).success).toBe(true);
    expect(UpdateProfileRequest.safeParse({ hintsSeen: { a: HINT_COUNT_MAX + 1 } }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ hintsSeen: { 'a.b': 1 } }).success).toBe(false);
    expect(UpdateProfileRequest.safeParse({ avatarUrl: 'https://x/' + 'a'.repeat(AVATAR_URL_MAX) }).success).toBe(false);
  });
});
