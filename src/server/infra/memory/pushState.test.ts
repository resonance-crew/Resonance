import { describe, expect, it } from 'vitest';
import { pushNotificationIn } from '@/server/app/pushSend';
import { pushTapIn, ringTapIn, untapBellIn } from '@/server/app/pushTap';
import { registerDeviceIn } from '@/server/app/pushDevices';
import { describePushStateContract } from '@/server/contract/pushState.contract';
import { memoryCtx } from './ctx';
import { memoryPush } from './push';

describePushStateContract('memory', () => memoryCtx());

// One whole scenario on memory, no Firestore anywhere: an install registers,
// a tap rings its card's author once (the row written for a build that draws
// it, the push sent under the card's collapse id), the token FCM gave up on
// is forgotten, and taking the tap back takes its reader out of the row.
describe('the push services on a memory context', () => {
  it('register → ring a tap → pushed once, the dead token forgotten → untap empties the row', async () => {
    const push = memoryPush(['tok-old']);
    const ctx = memoryCtx({ push });
    const now = Date.parse('2026-11-19T10:00:00Z');
    ctx.clock.set(now);
    ctx.state.seed('users', { ann: { handle: 'ann' }, ben: { handle: 'ben' } });
    ctx.state.seed('cards', { walk: { authorId: 'ann', visibility: 'public', anonymous: false, publishedAt: new Date(now - 86_400_000) } });
    ctx.state.seed('resonanceTaps', { walk_ben: { on: true, rangAt: null } });
    await registerDeviceIn(ctx, 'ann', 'phone', { token: 'tok-new', platform: 'ios', locale: 'en', capabilities: ['bell-tap'] });
    await registerDeviceIn(ctx, 'ann', 'tablet', { token: 'tok-old', platform: 'android', locale: 'en', capabilities: ['bell-tap'] });

    const ring = await ringTapIn(ctx, 'ben', 'walk');
    expect(ring).toEqual({ to: 'ann', handle: 'ben', notificationId: 'rtap_walk_20261119', others: 0 });
    // Once ever: a second ring finds the tap already rang.
    expect(await ringTapIn(ctx, 'ben', 'walk')).toBeNull();
    expect(await pushTapIn(ctx, { ...ring!, from: 'ben', cardId: 'walk' })).toEqual({ sent: 1, pruned: 1 });
    expect(push.sends).toHaveLength(1);
    expect(push.sends[0]).toMatchObject({ tokens: ['tok-new', 'tok-old'], message: { tag: 'rtap_walk', collapseId: 'rtap_walk', threadId: 'resonance_tap', data: { notificationId: 'rtap_walk_20261119' } } });
    expect(Object.keys(ctx.state.dump().devices)).toEqual(['phone']);
    // The row is written already pushed: nothing rings it again.
    expect(await pushNotificationIn(ctx, 'rtap_walk_20261119')).toBeNull();

    ctx.state.merge('resonanceTaps', 'walk_ben', { on: false });
    await untapBellIn(ctx, 'ben', 'walk');
    expect(ctx.state.get('notifications', 'rtap_walk_20261119')).toBeNull();
  });
});
