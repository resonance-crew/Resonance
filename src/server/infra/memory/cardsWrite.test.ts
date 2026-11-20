import { describeCardsWriteContract } from '@/server/contract/cardsWrite.contract';
import { memoryCtx } from './ctx';

/** A document path as a memory table and row id: `cards/c1/edits/current` → table `cards/c1/edits`, id `current`. */
const split = (path: string) => ({ table: path.slice(0, path.lastIndexOf('/')), id: path.slice(path.lastIndexOf('/') + 1) });

// The cards / users write contract on the memory repositories (the emulator runs it on Firestore:
// test/emulator/ports.cardsWrite.emulator.test.ts).
describeCardsWriteContract('memory', async (seed) => {
  const ctx = memoryCtx();
  for (const [path, row] of Object.entries(seed)) {
    const { table, id } = split(path);
    ctx.state.put(table, id, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)));
  }
  return {
    uow: ctx.uow,
    data: ctx.data,
    peek: async (path) => {
      const { table, id } = split(path);
      return ctx.state.get(table, id);
    },
  };
});
