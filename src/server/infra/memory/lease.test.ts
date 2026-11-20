import { expect, it } from 'vitest';
import { describeLeaseStoreContract } from '@/server/contract/lease.contract';
import { memoryLeaseStore } from './lease';
import { MemoryState } from './state';

let n = 0;
describeLeaseStoreContract('memory', async () => {
  n++;
  return { leases: memoryLeaseStore(new MemoryState()), key: `recommendations/u${n}`, other: `recommendations/v${n}` };
});

it('keeps the lease on the row it names, beside what the row holds', async () => {
  const state = new MemoryState();
  state.seed('recommendations', { u1: { date: '2026-11-20' } });
  const leases = memoryLeaseStore(state);
  await leases.acquire('recommendations/u1', 1_000, 5_000);
  expect(state.get('recommendations', 'u1')).toEqual({ date: '2026-11-20', leaseUntil: new Date(6_000) });
  await leases.release('recommendations/u1');
  expect(state.get('recommendations', 'u1')).toEqual({ date: '2026-11-20' });
});
