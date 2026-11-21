'use client';

import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { callApi } from './api';

/**
 * Best-effort sync of a hint's seen-count to the signed-in account
 * (PATCH /api/v1/me `hintsSeen`, which keeps the larger of the two counts),
 * so dismissed hints stay quiet across devices. Failures are swallowed —
 * localStorage remains the source of truth on this device.
 */
export async function syncHintCount(key: string, count: number): Promise<void> {
  if (!getFirebaseClientAuth().currentUser) return;
  try {
    await callApi('/api/v1/me', { method: 'PATCH', body: { hintsSeen: { [key]: count } } });
  } catch {
    // offline / a refused key — the local count still governs this device
  }
}
