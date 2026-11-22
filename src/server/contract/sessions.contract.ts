import { beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_GRACE_MS } from '@/server/domain/session';
import type { RefreshRow, SessionStore } from '@/server/ports/sessions';

/**
 * What every SessionStore adapter guarantees about rotating a refresh token
 * (ports/sessions.ts, ADR 0004, L3's grace), run on memory
 * (src/server/infra/memory/sessions.test.ts) and on Firestore's emulator
 * (test/emulator/ports.sessions.emulator.test.ts). `make` answers a store
 * and a uid of the test's own.
 */
export function describeSessionStoreContract(name: string, make: () => Promise<{ store: SessionStore; uid: string }>) {
  describe(`SessionStore contract — ${name}`, () => {
    const T = Date.UTC(2026, 10, 22, 9);
    let h: { store: SessionStore; uid: string };
    let n = 0;
    const hash = (label: string) => `${label}-${n}`.padEnd(64, '0');
    const row = (at: number, family = `fam-${n}`): RefreshRow => ({
      uid: h.uid,
      family,
      authTime: Math.floor(T / 1000),
      createdAt: new Date(at),
      expiresAt: new Date(at + 30 * 86_400_000),
      usedAt: null,
    });
    /** Rotate `from` into `to` at `at`. */
    const rotate = (from: string, to: string, at: number) => h.store.rotateRefresh(hash(from), hash(to), () => row(at), new Date(at));

    beforeEach(async () => {
      n++;
      h = await make();
      await h.store.putRefresh(hash('a'), row(T));
    });

    it('rotates once: the token used (its successor kept on it), the next one stored unused', async () => {
      expect(await rotate('a', 'b', T + 1)).toMatchObject({ kind: 'rotated', row: { uid: h.uid, usedAt: new Date(T + 1) } });
      expect(await h.store.getRefresh(hash('a'))).toMatchObject({ usedAt: new Date(T + 1), nextHash: hash('b') });
      expect(await h.store.getRefresh(hash('b'))).toMatchObject({ uid: h.uid, family: `fam-${n}`, usedAt: null });
    });

    it('two rotations racing within the grace: exactly one wins, the other is superseded and nothing is revoked', async () => {
      const outcomes = await Promise.all([rotate('a', 'b', T + 1), rotate('a', 'c', T + 1)]);
      expect(outcomes.map((o) => o.kind).sort()).toEqual(['rotated', 'superseded']);
      const winner = outcomes[0].kind === 'rotated' ? 'b' : 'c';
      const loser = winner === 'b' ? 'c' : 'b';
      expect(await h.store.getRefresh(hash(winner))).toMatchObject({ usedAt: null });
      expect(await h.store.getRefresh(hash(loser))).toBeNull();
      expect(await h.store.getRefresh(hash('a'))).toMatchObject({ nextHash: hash(winner) });
    });

    it('a retry after a lost answer, at the grace\'s end: superseded, again and again, nothing changes', async () => {
      await rotate('a', 'b', T);
      expect(await rotate('a', 'c', T + 1_000)).toEqual({ kind: 'superseded' });
      expect(await rotate('a', 'd', T + REFRESH_GRACE_MS)).toEqual({ kind: 'superseded' });
      expect(await h.store.getRefresh(hash('b'))).toMatchObject({ usedAt: null });
      expect(await h.store.getRefresh(hash('c'))).toBeNull();
      expect(await h.store.getRefresh(hash('d'))).toBeNull();
    });

    it('presented again past the grace: reused, and the whole family is gone (another family stands)', async () => {
      await h.store.putRefresh(hash('other'), row(T, `other-${n}`));
      await rotate('a', 'b', T);
      expect(await rotate('a', 'c', T + REFRESH_GRACE_MS + 1)).toEqual({ kind: 'reused', uid: h.uid, family: `fam-${n}` });
      expect(await h.store.getRefresh(hash('a'))).toBeNull();
      expect(await h.store.getRefresh(hash('b'))).toBeNull();
      expect(await h.store.getRefresh(hash('c'))).toBeNull();
      expect(await h.store.getRefresh(hash('other'))).not.toBeNull();
    });

    it('a token two generations old, within the grace: reused (its successor was used), the family gone', async () => {
      await rotate('a', 'b', T);
      await rotate('b', 'c', T + 1);
      expect(await rotate('a', 'd', T + 2)).toEqual({ kind: 'reused', uid: h.uid, family: `fam-${n}` });
      expect(await h.store.getRefresh(hash('c'))).toBeNull();
    });

    it('a used token with no successor kept (used before it was kept): reused even within the grace', async () => {
      await h.store.putRefresh(hash('old'), { ...row(T), usedAt: new Date(T) });
      expect((await h.store.rotateRefresh(hash('old'), hash('e'), () => row(T + 1), new Date(T + 1))).kind).toBe('reused');
    });

    it('expired: removed; unknown: nothing', async () => {
      expect(await rotate('a', 'b', T + 30 * 86_400_000)).toEqual({ kind: 'expired' });
      expect(await h.store.getRefresh(hash('a'))).toBeNull();
      expect(await rotate('nope', 'b', T)).toEqual({ kind: 'unknown' });
    });
  });
}
