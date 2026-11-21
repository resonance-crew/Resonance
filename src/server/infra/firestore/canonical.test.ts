import { afterAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { FieldValue, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { canonicalJson, toCanonical } from '@/server/domain/schema/canonical';
import { SPECS } from '@/server/domain/schema/registry';
import { firestoreCodec, firestoreRow, timestampOf } from './canonical';

// Firestore's own values ⇄ canonical rows, without a network: a Firestore
// object makes references and vectors offline. The emulator round trip is
// test/emulator/portability.roundtrip.emulator.test.ts.

const app = initializeApp({ projectId: 'demo-canonical-unit' }, 'canonical-unit');
const db = getFirestore(app);
const codec = firestoreCodec(db);

afterAll(() => deleteApp(app));

describe('the Firestore codec', () => {
  it('reads a Timestamp to its microsecond, a vector, a reference, bytes and a point', () => {
    const { row } = toCanonical(
      'cardVectors',
      SPECS.cardVectors.schema,
      'c__insight__0',
      {
        vector: FieldValue.vector([0.25, -1]),
        updatedAt: new Timestamp(1_763_607_845, 123_456_789),
        source: db.doc('cards/c'),
        blob: Buffer.from([1, 2, 3]),
        where: new GeoPoint(25, 121.5),
      },
      codec,
    );
    expect(row).toMatchObject({
      vector: [0.25, -1],
      updatedAt: '2025-11-20T03:04:05.123456Z',
      source: { $ref: 'cards/c' },
      blob: { $bytes: 'AQID' },
      where: { $geo: [25, 121.5] },
    });
  });

  it('writes a canonical row back to the values it came from', () => {
    const stored = {
      senderId: 'u1',
      sentAt: new Timestamp(1_763_607_845, 123_456_000),
      reactions: { u2: 'heart' },
      legacy: { at: timestampOf('2026-01-01T00:00:00.000000Z') },
    };
    const first = toCanonical('messages', SPECS.messages.schema, 'p/m', stored, codec).row;
    const back = firestoreRow(db, 'messages', first);
    expect((back.sentAt as Timestamp).isEqual(stored.sentAt)).toBe(true);
    expect((back.legacy as { at: Timestamp }).at).toBeInstanceOf(Timestamp);
    expect(canonicalJson(toCanonical('messages', SPECS.messages.schema, 'p/m', back, codec).row)).toBe(canonicalJson(first));
    const vector = firestoreRow(db, 'cardVectors', { _e: 'cardVectors', _id: 'x', _v: 1, vector: [1, 2] }).vector;
    expect(vector).toEqual(FieldValue.vector([1, 2]));
  });

  it('refuses a write sentinel: a read never holds one', () => {
    expect(() => toCanonical('cards', SPECS.cards.schema, 'c', { anonymous: false, createdAt: FieldValue.serverTimestamp() }, codec)).toThrow(/FieldValue/);
  });
});
