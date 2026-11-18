// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

const auth = vi.hoisted(() => ({ user: { id: 'alice' } as { id: string } | null }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }));
const callApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: (...a: unknown[]) => callApi(...a) }));

import { isOn, useNotificationSettings } from './notificationSettings';

// The push switches' read and write: whose they are, and that a flip shows
// at once and is undone when it doesn't save.

const cache = new Map();
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  cache.clear();
  callApi.mockReset();
  auth.user = { id: 'alice' };
});

describe('useNotificationSettings', () => {
  it("keeps each viewer's switches apart, and reads nothing signed out", async () => {
    callApi.mockResolvedValueOnce({ picks: true, connectionCards: false }).mockResolvedValueOnce({ picks: false, connectionCards: false });
    const { result, rerender } = renderHook(() => useNotificationSettings(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ picks: true, connectionCards: false }));
    expect(cache.has('notifications:alice')).toBe(true);

    // Another account signed in on this browser: never Alice's answer.
    auth.user = { id: 'bob' };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual({ picks: false, connectionCards: false }));
    expect(callApi).toHaveBeenCalledTimes(2);

    auth.user = null;
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it("sends only the switch flipped, and undoes it when the server refuses", async () => {
    callApi.mockResolvedValueOnce({ picks: false, connectionCards: false });
    const { result } = renderHook(() => useNotificationSettings(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    callApi.mockResolvedValueOnce({ picks: true, connectionCards: false });
    await result.current.set('picks', true);
    expect(callApi).toHaveBeenLastCalledWith('/api/v1/me/notifications', { method: 'PATCH', body: { picks: true } });
    await waitFor(() => expect(result.current.data).toEqual({ picks: true, connectionCards: false }));

    callApi.mockRejectedValueOnce(new Error('500'));
    await result.current.set('connectionCards', true);
    await waitFor(() => expect(result.current.saveFailed).toBe(true));
    expect(result.current.data).toEqual({ picks: true, connectionCards: false });
  });

  // Round 26 §U8: 有人共振 rings by default — like messages, it is on until the person turns it off (an older
  // server, or one that never stored it, leaves it out); picks and connection cards stay off until turned on.
  it('reads 有人共振 and messages as on unless said off, the others as off unless said on', () => {
    for (const data of [undefined, {}, { picks: false, connectionCards: false }]) {
      expect(isOn(data as never, 'resonanceTaps')).toBe(true);
      expect(isOn(data as never, 'messages')).toBe(true);
      expect(isOn(data as never, 'picks')).toBe(false);
      expect(isOn(data as never, 'connectionCards')).toBe(false);
    }
    expect(isOn({ picks: false, connectionCards: false, resonanceTaps: false }, 'resonanceTaps')).toBe(false);
    expect(isOn({ picks: true, connectionCards: false }, 'picks')).toBe(true);
  });

  it('turns 有人共振 off with only that switch sent', async () => {
    callApi.mockResolvedValueOnce({ picks: false, connectionCards: false });
    const { result } = renderHook(() => useNotificationSettings(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(isOn(result.current.data, 'resonanceTaps')).toBe(true);
    callApi.mockResolvedValueOnce({ picks: false, connectionCards: false, resonanceTaps: false });
    await result.current.set('resonanceTaps', false);
    expect(callApi).toHaveBeenLastCalledWith('/api/v1/me/notifications', { method: 'PATCH', body: { resonanceTaps: false } });
    await waitFor(() => expect(isOn(result.current.data, 'resonanceTaps')).toBe(false));
  });
});
