// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { renderHook, waitFor } from '@testing-library/react';

// What the server answers this test (a plain function: a rejection made by a mock is reported however it is caught).
let answer: () => Promise<boolean> = async () => false;
const asked = vi.fn<(id: string) => void>();
vi.mock('@/lib/db/firestore/client/cards', () => ({
  getPrivateShares: (id: string) => {
    asked(id);
    return answer();
  },
}));

const { useSharedPrivately } = await import('./privateShares');

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

// The publish step's warning before 匿名公開: a 私人卡 once sent in a message is known to whoever read it.
describe('useSharedPrivately', () => {
  beforeEach(() => asked.mockReset());

  it('asks the server only while the step asks, and says yes only on its yes', async () => {
    answer = async () => true;
    const { result, rerender } = renderHook(({ asking }) => useSharedPrivately('c1', asking), { wrapper, initialProps: { asking: false } });
    expect(result.current).toBe(false);
    expect(asked).not.toHaveBeenCalled();
    rerender({ asking: true });
    await waitFor(() => expect(result.current).toBe(true));
    expect(asked).toHaveBeenCalledWith('c1');
  });

  it('says nothing for a card not yet made, or when the read fails', async () => {
    let failed = false;
    answer = () => {
      failed = true;
      return Promise.reject(new Error('offline'));
    };
    const none = renderHook(() => useSharedPrivately(undefined, true), { wrapper });
    expect(none.result.current).toBe(false);
    expect(asked).not.toHaveBeenCalled();
    const failing = renderHook(() => useSharedPrivately('c2', true), { wrapper });
    await waitFor(() => expect(failed).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.result.current).toBe(false);
  });
});
