import { describeRecommendRepoContract } from '@/server/contract/recommend.contract';
import { MemoryState, type Row } from '../state';
import { memoryUow } from '../uow';
import { recommendData } from './recommend';

const msOf = (v: unknown): unknown =>
  v instanceof Date ? v.getTime() : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Row).map(([k, x]) => [k, msOf(x)])) : v;

describeRecommendRepoContract('memory', async () => {
  const state = new MemoryState();
  return {
    data: recommendData(state),
    uow: memoryUow(state),
    seed: async (table, id, row) => state.put(table, id, row),
    peek: async (table, id) => (msOf(state.get(table, id)) as Record<string, unknown> | null) ?? null,
  };
});
