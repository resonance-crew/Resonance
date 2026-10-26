'use client';

import { ensureAppCheck, getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { appCheckHeaders } from '@/lib/auth/firebase/appCheck';

/** A failed /api/v1 call: the HTTP status and the body's `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Call the versioned API (/api/v1) from the browser, the way the apps do: the
 * signed-in user's Firebase ID token rides along as a Bearer token, so a call
 * made right after signing in never races the session cookie, and so does
 * an App Check token when one is at hand. JSON in, JSON out; a non-2xx
 * answer throws an ApiError.
 */
export async function callApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  ensureAppCheck();
  const user = getFirebaseClientAuth().currentUser;
  // The App Check token rides along when one is at hand (lib/auth/firebase/appCheck).
  const [idToken, appCheck] = await Promise.all([user?.getIdToken(), appCheckHeaders()]);
  const headers: Record<string, string> = { ...appCheck };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  return answer<T>(res);
}

/** callApi for a multipart form (an upload): the same token, App Check and errors; the browser sets the boundary. */
export async function callApiForm<T>(path: string, form: FormData): Promise<T> {
  ensureAppCheck();
  const user = getFirebaseClientAuth().currentUser;
  const [idToken, appCheck] = await Promise.all([user?.getIdToken(), appCheckHeaders()]);
  const headers: Record<string, string> = { ...appCheck };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(path, { method: 'POST', headers, body: form, credentials: 'same-origin' });
  return answer<T>(res);
}

/** A v1 answer's JSON, or the ApiError a non-2xx answer is. */
async function answer<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}
