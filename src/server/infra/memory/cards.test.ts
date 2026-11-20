import { describeCardsReadContract } from '@/server/contract/cards.contract';
import { memoryCtx } from './ctx';

// The cards / users read contract on the memory repositories (the emulator runs it on Firestore:
// test/emulator/ports.cards.emulator.test.ts).
describeCardsReadContract('memory', async (seed) => {
  const ctx = memoryCtx();
  ctx.state.seed('cards', seed.cards ?? {});
  ctx.state.seed('users', seed.users ?? {});
  for (const [uid, other] of seed.blocks ?? []) ctx.state.put(`users/${uid}/blocks`, other, { blockedUid: other });
  for (const [a, b] of seed.connections ?? []) ctx.state.put('connections', a < b ? `${a}_${b}` : `${b}_${a}`, { users: [a, b] });
  return ctx.data;
});
