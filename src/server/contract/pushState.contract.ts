import { beforeEach, describe, expect, it } from 'vitest';
import { registerDeviceIn, unregisterDeviceIn } from '@/server/app/pushDevices';
import { getNotificationSettingsIn, optedInIn, updateNotificationSettingsIn } from '@/server/app/pushSettings';
import type { ServerCtx } from '@/server/ctx';
import { MAX_DEVICES } from '@/server/domain/push/devices';

/**
 * What the pushState and bell repositories guarantee, whatever keeps them:
 * run on memory (src/server/infra/memory/pushState.test.ts) and on
 * Firestore's emulator (test/emulator/ports.push.emulator.test.ts). `make`
 * answers a context over an empty database for each test.
 */
export function describePushStateContract(name: string, make: () => ServerCtx | Promise<ServerCtx>) {
  describe(`pushState / bell contract — ${name}`, () => {
    let ctx: ServerCtx;
    beforeEach(async () => {
      ctx = await make();
    });

    const register = (uid: string, id: string, extra: Partial<Parameters<typeof registerDeviceIn>[3]> = {}) =>
      registerDeviceIn(ctx, uid, id, { token: `tok-${id}`, platform: 'android', locale: 'zh-Hant-TW', capabilities: ['chat-push', 'chat-push', 'BAD CAP'], ...extra });

    it('keeps a registered install, its language and capabilities cleaned, and lists it for a push', async () => {
      await register('ann', 'i1');
      await register('ann', 'i2', { token: '', platform: 'ios' });
      expect(await ctx.data.pushState.listDevices('ann')).toEqual([{ id: 'i1', token: 'tok-i1', locale: 'zh-TW', platform: 'android', capabilities: ['chat-push'] }]);
      // Tokenless records still count for what the builds can draw.
      expect(await ctx.data.pushState.listDeviceCapabilities('ann')).toEqual([['chat-push'], ['chat-push']]);
    });

    it(`forgets the least recently registered past ${MAX_DEVICES}, and an install moves to whoever signs in on it`, async () => {
      for (let i = 0; i <= MAX_DEVICES; i++) await register('ann', `d${String(i).padStart(2, '0')}`);
      const left = (await ctx.data.pushState.listDevices('ann')).map((d) => d.id).sort();
      expect(left).toHaveLength(MAX_DEVICES);
      expect(left).not.toContain('d00');
      await register('ben', 'd05');
      await unregisterDeviceIn(ctx, 'ann', 'd05');
      expect((await ctx.data.pushState.listDevices('ben')).map((d) => d.id)).toEqual(['d05']);
      await unregisterDeviceIn(ctx, 'ben', 'd05');
      expect(await ctx.data.pushState.listDevices('ben')).toEqual([]);
    });

    it('settings: a missing record reads as the defaults; turning a switch on is kept, and found by the walk', async () => {
      expect(await getNotificationSettingsIn(ctx, 'ann')).toEqual({ picks: false, connectionCards: false, messages: true, resonanceTaps: true });
      expect(await updateNotificationSettingsIn(ctx, 'ann', { picks: true, messages: null })).toEqual({ picks: true, connectionCards: false, messages: true, resonanceTaps: true });
      await updateNotificationSettingsIn(ctx, 'cat', { picks: true });
      await updateNotificationSettingsIn(ctx, 'ben', { connectionCards: true });
      const walked: string[][] = [];
      for await (const page of optedInIn(ctx, 'picks', { from: 'b', pageSize: 1 })) walked.push(page);
      expect(walked).toEqual([['cat'], ['ann']]);
      expect(await ctx.data.pushState.getManySettings(['ben', 'nobody'])).toEqual([
        { picks: false, connectionCards: true, messages: true, resonanceTaps: true },
        { picks: false, connectionCards: false, messages: true, resonanceTaps: true },
      ]);
    });

    it('bell: insertIfAbsent writes a row once (already pushed, unread); a second call answers exists', async () => {
      const row = { userId: 'ann', type: 'read_summary', payload: { cardId: 'c1', readers: 3 }, atMs: Date.UTC(2026, 10, 16) };
      expect(await ctx.data.bell.insertIfAbsent('rsum_c1_20261116', row)).toBe('inserted');
      expect(await ctx.data.bell.insertIfAbsent('rsum_c1_20261116', { ...row, payload: { cardId: 'c1', readers: 9 } })).toBe('exists');
      const got = await ctx.uow.run(async (tx) => tx.bell.getRow('rsum_c1_20261116'));
      expect(got).toEqual({ id: 'rsum_c1_20261116', userId: 'ann', type: 'read_summary', payload: { cardId: 'c1', readers: 3 }, pushed: true, read: false });
    });

    it('bell: a tap row keeps its readers, and goes when the last one leaves', async () => {
      await ctx.uow.run(async (tx) => {
        await tx.bell.getRow('rtap_c1_20261116');
        tx.bell.putRow('rtap_c1_20261116', { userId: 'ann', type: 'resonance_tap', payload: { cardId: 'c1', fromUserIds: ['ben'] }, atMs: 1 });
      });
      await ctx.uow.run(async (tx) => tx.bell.bumpTapRow('rtap_c1_20261116', ['cat', 'ben'], 2));
      expect(await ctx.data.bell.listRowIdsNaming('cat')).toEqual(['rtap_c1_20261116']);
      const row = await ctx.uow.run(async (tx) => tx.bell.getRow('rtap_c1_20261116'));
      expect(row?.payload).toEqual({ cardId: 'c1', fromUserIds: ['cat', 'ben'] });
      await ctx.uow.run(async (tx) => tx.bell.deleteRow('rtap_c1_20261116'));
      expect(await ctx.data.bell.listRowIdsNaming('cat')).toEqual([]);
    });
  });
}
