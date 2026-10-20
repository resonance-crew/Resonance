import { describe, expect, it, vi } from 'vitest';
import type { Card, User } from '@/lib/db/types';
import { signingKey } from '@/lib/links/imageProxy';
import { drawnCard, drawnCardVersion } from './model';
import { imageVersion, keyedImageVersion, shareVersionKey } from './version';

// A drawn card's version is in its image's public URL, and the image it names
// shows the card's pen name. Made from what anyone can read, a version could be
// made for a guessed pen name of a card since made anonymous, and asked for to
// see whether the CDN still holds the drawing under that name; keyed, it can't.

const card = {
  id: 'card1',
  thoughtCore: '外婆的醃梅子',
  story: '每年五月，外婆都會把青梅一顆顆擦乾。',
  anonymous: false,
  publishedAt: new Date('2026-10-10T03:00:00Z'),
} as Card;
const author = { handle: 'quiet-walker', initials: 'QW', avatarSeed: '41', avatarUrl: null } as unknown as User;

describe("a drawn card's version", () => {
  const drawn = drawnCard(card, author);
  const keyA = Buffer.from('a'.repeat(32));
  const keyB = Buffer.from('b'.repeat(32));

  it('is not one anyone can make from what the card and its author show', () => {
    const unkeyed = imageVersion(JSON.stringify(drawn));
    expect(drawnCardVersion(drawn, keyA)).not.toBe(unkeyed);
    expect(drawnCardVersion(drawn, keyA)).not.toBe(drawnCardVersion(drawn, keyB));
    // The process's own key (a fixed one outside production) is used when none is given.
    expect(drawnCardVersion(drawn)).not.toBe(unkeyed);
    expect(drawnCardVersion(drawn)).toBe(drawnCardVersion(drawnCard(card, author)));
  });

  it('is still a new URL for every change to what is drawn, and needs no escaping', () => {
    const renamed = drawnCard(card, { ...author, handle: 'quiet-walker-2' });
    expect(drawnCardVersion(renamed, keyA)).not.toBe(drawnCardVersion(drawn, keyA));
    expect(drawnCardVersion(drawn, keyA)).toMatch(/^[0-9a-f]{20}$/);
    expect(keyedImageVersion('x', null)).toBe(imageVersion('x'));
  });
});

describe('the key it is made with', () => {
  const PEM = '-----BEGIN PRIVATE KEY-----\\nMIIEv\\n-----END PRIVATE KEY-----\\n';

  it("is derived from the link-preview secret, else the service account's key — never either as it is, nor the link pictures' key", () => {
    const fromSecret = shareVersionKey({ LINK_PREVIEW_SECRET: 's3cret', NODE_ENV: 'production' });
    const fromPem = shareVersionKey({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production' });
    expect(fromSecret).toHaveLength(32);
    expect(fromPem).toHaveLength(32);
    expect(fromSecret!.equals(fromPem!)).toBe(false);
    expect(fromSecret!.equals(Buffer.from('s3cret'))).toBe(false);
    expect(fromSecret!.equals(signingKey({ LINK_PREVIEW_SECRET: 's3cret', NODE_ENV: 'production' }))).toBe(false);
    expect(fromPem!.equals(signingKey({ FIREBASE_PRIVATE_KEY: PEM, NODE_ENV: 'production' }))).toBe(false);
    expect(shareVersionKey({ LINK_PREVIEW_SECRET: 'other', NODE_ENV: 'production' })!.equals(fromSecret!)).toBe(false);
  });

  it('is a fixed one outside production, and none — an unkeyed version, logged once — in a production without either', () => {
    expect(shareVersionKey({ NODE_ENV: 'test' })).toEqual(shareVersionKey({ NODE_ENV: 'development' }));
    expect(shareVersionKey({ NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).not.toBeNull();
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(shareVersionKey({ NODE_ENV: 'production' })).toBeNull();
    expect(shareVersionKey({ NODE_ENV: 'production' })).toBeNull();
    expect(warned).toHaveBeenCalledTimes(1);
    warned.mockRestore();
  });
});
