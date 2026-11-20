import { describeTranslationsContract } from '@/server/contract/translations.contract';
import { memoryCtx } from '../ctx';

// The translations repositories over memory against the same contract as
// Firestore's emulator (test/emulator/ports.translations.emulator.test.ts).

describeTranslationsContract('memory', () => {
  const ctx = memoryCtx();
  return {
    uow: ctx.uow,
    data: ctx.data,
    card: (n) => n,
    async seedCard(id, fields) {
      ctx.state.put('cards', id, fields);
    },
    async touchCard(id, fields) {
      ctx.state.merge('cards', id, fields);
    },
    readCard: async (id) => ctx.state.get('cards', id),
  };
});
