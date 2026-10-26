// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The browser side of sign-in: who is signed in reaches the UI the moment
// the Firebase SDK knows it, while the server session cookie (needed only by
// the middleware and cookie-authenticated /api routes) is minted behind it —
// once, and only when it's missing or nearly spent.

const fb = vi.hoisted(() => {
  const auth = { currentUser: null as unknown };
  return {
    auth,
    listeners: [] as ((user: unknown) => void)[],
    getAuth: vi.fn(() => auth),
    initializeAuth: vi.fn(() => auth),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(async () => undefined),
  };
});
const app = vi.hoisted(() => ({ made: [] as object[], initializeApp: vi.fn() }));
vi.mock('firebase/app', () => ({ getApps: () => app.made, initializeApp: app.initializeApp }));
const startAppCheck = vi.hoisted(() => vi.fn());
vi.mock('./appCheck', () => ({ startAppCheck }));
vi.mock('firebase/auth', () => ({
  getAuth: fb.getAuth,
  initializeAuth: fb.initializeAuth,
  onIdTokenChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fb.listeners.push(cb);
    return () => undefined;
  },
  onAuthStateChanged: vi.fn(),
  signInWithPopup: fb.signInWithPopup,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: fb.signOut,
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  OAuthProvider: class {},
  browserPopupRedirectResolver: 'popup-resolver',
  indexedDBLocalPersistence: 'indexedDB',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
}));

const DAY = 24 * 60 * 60 * 1000;
const MARK = 'resonance:session';

function firebaseUser(uid: string) {
  return { uid, email: `${uid}@example.com`, phoneNumber: null, emailVerified: true, getIdToken: async () => `token-${uid}` };
}

/** POST /api/auth/session calls, each held open until released. */
let posts: { body: unknown; release: (res?: Partial<Response>) => void }[];
const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (init?.method === 'POST') {
    return new Promise((resolve) => {
      posts.push({
        body: JSON.parse(String(init.body)),
        release: (res = {}) => resolve({ ok: true, json: async () => ({ ok: true }), ...res }),
      });
    });
  }
  return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
});
const sessionPosts = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/auth/session' && init?.method === 'POST');

/** A fresh copy of the module (its Auth instance and in-flight state are module-level). */
async function load() {
  vi.resetModules();
  return import('./client');
}

function remember(uid: string, expiresAt: number) {
  window.localStorage.setItem(MARK, JSON.stringify({ uid, expiresAt }));
}

/** Let promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  app.made = [{ name: '[DEFAULT]' }];
  startAppCheck.mockClear();
  posts = [];
  fb.listeners.length = 0;
  fb.auth.currentUser = null;
  fetchMock.mockClear();
  fb.getAuth.mockClear();
  fb.initializeAuth.mockClear();
  fb.signInWithPopup.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  window.history.replaceState({}, '', '/en/home');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('restoring a signed-in reader', () => {
  it('reports the user at once and mints a missing cookie behind it', async () => {
    const { firebaseClientAuthProvider } = await load();
    const seen: { id: string | undefined; ready: boolean }[] = [];
    let settled: Promise<void> = Promise.resolve();
    firebaseClientAuthProvider.subscribe((user, session) => {
      seen.push({ id: user?.id, ready: session.ready });
      settled = session.settled;
    });

    fb.listeners[0](firebaseUser('u1'));
    // The UI already knows who it is; the cookie is still on its way.
    expect(seen).toEqual([{ id: 'u1', ready: false }]);
    await flush();
    expect(sessionPosts()).toHaveLength(1);
    expect(posts[0].body).toEqual({ idToken: 'token-u1' });

    posts[0].release();
    await settled;
    const mark = JSON.parse(window.localStorage.getItem(MARK)!);
    expect(mark.uid).toBe('u1');
    expect(mark.expiresAt - Date.now()).toBeGreaterThan(6 * DAY);
  });

  it('sends nothing while the cookie has more than a day left', async () => {
    remember('u1', Date.now() + 3 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    fb.listeners[0](firebaseUser('u1')); // the hourly token refresh
    await flush();
    expect(sessionPosts()).toHaveLength(0);
    expect(ready).toEqual([true, true]);
  });

  it('refreshes a cookie with under a day left, without holding anything up', async () => {
    remember('u1', Date.now() + 2 * 60 * 60 * 1000);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    expect(ready).toEqual([true]); // the old cookie still works meanwhile
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it("mints anew for a different account than the cookie's", async () => {
    remember('someone-else', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    expect(ready).toEqual([false]);
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it('sends one request however many token ticks arrive while it is out', async () => {
    const { firebaseClientAuthProvider } = await load();
    firebaseClientAuthProvider.subscribe(() => undefined);
    fb.listeners[0](firebaseUser('u1'));
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it("uses the lifetime the server reports, when it reports one", async () => {
    const { firebaseClientAuthProvider } = await load();
    let settled: Promise<void> = Promise.resolve();
    firebaseClientAuthProvider.subscribe((_u, session) => (settled = session.settled));
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    posts[0].release({ json: async () => ({ ok: true, expiresIn: 2 * DAY }) });
    await settled;
    const { expiresAt } = JSON.parse(window.localStorage.getItem(MARK)!);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(2 * DAY);
    expect(expiresAt - Date.now()).toBeGreaterThan(2 * DAY - 60_000);
  });

  it('keeps working when storage is unavailable (it just mints on every load)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { firebaseClientAuthProvider } = await load();
    let settled: Promise<void> = Promise.resolve();
    const seen: (string | undefined)[] = [];
    firebaseClientAuthProvider.subscribe((user, session) => {
      seen.push(user?.id);
      settled = session.settled;
    });
    fb.listeners[0](firebaseUser('u1'));
    expect(seen).toEqual(['u1']);
    await flush();
    posts[0].release();
    await expect(settled).resolves.toBeUndefined();
  });

  it('forgets the cookie when no one is signed in', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));
    fb.listeners[0](null);
    expect(ready).toEqual([true]);
    expect(window.localStorage.getItem(MARK)).toBeNull();
  });
});

describe('signing in and out', () => {
  it('waits for a fresh cookie on sign-in — one request, even as the listener fires too', async () => {
    remember('u1', Date.now() + 5 * DAY); // an explicit sign-in mints regardless
    const { firebaseClientAuthProvider } = await load();
    firebaseClientAuthProvider.subscribe(() => undefined);
    fb.signInWithPopup.mockImplementation(async () => {
      fb.listeners[0](firebaseUser('u1'));
      return { user: firebaseUser('u1') };
    });

    let done = false;
    const signingIn = firebaseClientAuthProvider.signInWithGoogle().then((u) => {
      done = true;
      return u;
    });
    await flush();
    expect(fb.signInWithPopup).toHaveBeenCalledWith(fb.auth, expect.anything(), 'popup-resolver');
    expect(sessionPosts()).toHaveLength(1);
    expect(done).toBe(false); // the sign-in page navigates only once the cookie is set

    posts[0].release();
    await expect(signingIn).resolves.toMatchObject({ id: 'u1' });
  });

  it('fails the sign-in when the cookie cannot be minted', async () => {
    const { firebaseClientAuthProvider } = await load();
    fb.signInWithPopup.mockResolvedValue({ user: firebaseUser('u1') });
    const signingIn = firebaseClientAuthProvider.signInWithGoogle();
    await flush();
    posts[0].release({ ok: false });
    await expect(signingIn).rejects.toThrow('Unable to create session');
  });

  it('drops the cookie and what is remembered about it on sign-out', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    await firebaseClientAuthProvider.signOut();
    expect(fb.signOut).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { method: 'DELETE' });
    expect(window.localStorage.getItem(MARK)).toBeNull();
  });
});

// Firebase's popup resolver, on Safari and mobile, loads Google's gapi script
// and an iframe before it restores the user — so it is set up only where a
// sign-in popup may follow.
describe('setting Auth up', () => {
  it('skips the popup resolver for a signed-in reader away from the sign-in pages', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: ['indexedDB', 'local', 'session'],
    });
    expect(fb.getAuth).not.toHaveBeenCalled();
  });

  it('keeps it on the sign-in pages, so Safari lets the popup open', async () => {
    remember('u1', Date.now() + 5 * DAY);
    window.history.replaceState({}, '', '/zh-TW/signin');
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.getAuth).toHaveBeenCalled();
    expect(fb.initializeAuth).not.toHaveBeenCalled();
  });

  it('skips it for a visitor who is not signed in, away from the sign-in pages too', async () => {
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.initializeAuth).toHaveBeenCalled();
    expect(fb.getAuth).not.toHaveBeenCalled();
  });

  it('keeps it on the sign-up page', async () => {
    window.history.replaceState({}, '', '/en/signup?step=profile');
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.getAuth).toHaveBeenCalled();
    expect(fb.initializeAuth).not.toHaveBeenCalled();
  });
});

const UA = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  // An iPad asking for the desktop site says Macintosh — and Mobile.
  iPadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0',
};

// Firebase loads the popup's frame before the click on mobile browsers,
// Safari and iOS — the same rule, read off the same user agent.
describe('which browsers need the popup resolver before the click', () => {
  it('phones, iPads and Safari do; desktop Chrome, Edge and Firefox load it at the click', async () => {
    const { initsPopupProactively } = await load();
    expect(initsPopupProactively(UA.iPhoneSafari)).toBe(true);
    expect(initsPopupProactively(UA.iPhoneChrome)).toBe(true);
    expect(initsPopupProactively(UA.iPadDesktop)).toBe(true);
    expect(initsPopupProactively(UA.androidChrome)).toBe(true);
    expect(initsPopupProactively(UA.macSafari)).toBe(true);
    expect(initsPopupProactively(UA.macChrome)).toBe(false);
    expect(initsPopupProactively(UA.windowsEdge)).toBe(false);
    expect(initsPopupProactively(UA.firefox)).toBe(false);
  });
});

// A sign-in page reached by a client-side hop keeps the Auth the first page
// made — without the resolver now that only the sign-in pages set it up — so
// on those browsers it loads itself once more, and only once.
describe('a sign-in page reached without the popup resolver', () => {
  /** Auth made on the landing page, then a client-side hop to the sign-in page. */
  async function hopToSignIn() {
    window.history.replaceState({}, '', '/zh-TW');
    const client = await load();
    client.getFirebaseClientAuth();
    window.history.replaceState({}, '', '/zh-TW/signin');
    return client;
  }

  beforeEach(() => window.sessionStorage.clear());

  it('reloads once on a phone or Safari, and not again for half a minute', async () => {
    const { reloadForPopupOnce } = await hopToSignIn();
    const reload = vi.fn();
    expect(reloadForPopupOnce({ userAgent: UA.iPhoneSafari, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // Had the reload come back without the resolver all the same, it would not loop.
    expect(reloadForPopupOnce({ userAgent: UA.iPhoneSafari, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays put on desktop Chrome or Firefox, whose popup loads its frame at the click', async () => {
    const { reloadForPopupOnce } = await hopToSignIn();
    const reload = vi.fn();
    expect(reloadForPopupOnce({ userAgent: UA.macChrome, reload })).toBe(false);
    expect(reloadForPopupOnce({ userAgent: UA.firefox, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays put when the page itself set Auth up (opened directly, or after its reload)', async () => {
    window.history.replaceState({}, '', '/zh-TW/signin');
    const { getFirebaseClientAuth, reloadForPopupOnce } = await load();
    const reload = vi.fn();
    // Before anything made Auth (the buttons mount before the provider subscribes).
    expect(reloadForPopupOnce({ userAgent: UA.iPhoneSafari, reload })).toBe(false);
    getFirebaseClientAuth();
    expect(reloadForPopupOnce({ userAgent: UA.iPhoneSafari, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays put for someone already signed in (the sign-up page’s profile step needs no popup)', async () => {
    const { reloadForPopupOnce } = await hopToSignIn();
    fb.auth.currentUser = firebaseUser('u1');
    const reload = vi.fn();
    expect(reloadForPopupOnce({ userAgent: UA.androidChrome, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays put without storage to remember the reload by', async () => {
    const { reloadForPopupOnce } = await hopToSignIn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const reload = vi.fn();
    expect(reloadForPopupOnce({ userAgent: UA.iPhoneSafari, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

// Every page makes the app for Auth; only a read or an /api call needs App
// Check — a signed-out visitor on the landing page loads no Turnstile.
describe('App Check', () => {
  it('does not start with the app, and starts with the first read or call', async () => {
    app.made = [];
    const made = { name: '[DEFAULT]' };
    app.initializeApp.mockImplementationOnce(() => {
      app.made = [made];
      return made;
    });
    const { ensureAppCheck, getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(app.initializeApp).toHaveBeenCalledTimes(1);
    expect(startAppCheck).not.toHaveBeenCalled();

    ensureAppCheck();
    expect(startAppCheck).toHaveBeenCalledWith(made);
  });
});
