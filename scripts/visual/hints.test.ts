import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hintKey, unspendHints, unspendRequest, webStorageOf } from './hints';
import { SCREENS } from './screens';
import { PORTS, ROOT } from './util';

// Run 20261118-235458: card-note-open's privacy line (a first-three-times hint) on the web phone only, of the web and
// Android — the phone's three variants spent alice's three showings on the run's one stack, and the web's storage seed
// reset only the browser's half of the count.
const noteOpen = SCREENS.find((s) => s.id === 'card-note-open')!;
const source = (file: string) => readFileSync(join(ROOT, 'scripts/visual', file), 'utf8');

describe('first-times hints in the captures', () => {
  it('card-note-open starts every capture with alice’s note-privacy hint unspent, and says every capture shows the line', () => {
    expect(noteOpen.as).toBe('alice');
    expect(noteOpen.hints).toEqual(['note-privacy']);
    expect(noteOpen.expect).toMatch(/這段話只有作者看得到 on every capture/);
    expect(noteOpen.expect).not.toMatch(/later captures/);
  });

  it('every screen with hints is signed in (the count is an account’s)', () => {
    for (const s of SCREENS.filter((x) => x.hints?.length)) expect(s.as, s.id).not.toBeNull();
  });

  it('the web keeps each hint’s own count at 0 beside the screen’s storage', () => {
    expect(webStorageOf(noteOpen)).toEqual({ [hintKey('note-privacy')]: '0' });
    expect(hintKey('note-privacy')).toBe('hint:note-privacy');
    expect(webStorageOf({ web: { storage: { a: '1' } }, hints: ['x'] })).toEqual({ a: '1', 'hint:x': '0' });
    expect(webStorageOf({})).toEqual({});
  });

  it('asks the stack’s Firestore emulator to take the hint out of the account’s hintsSeen, as its owner', () => {
    const { url, init } = unspendRequest(8280, 'alice', ['note-privacy', 'plain_key']);
    const u = new URL(url);
    expect(u.origin).toBe('http://127.0.0.1:8280');
    expect(decodeURIComponent(u.pathname)).toBe('/v1/projects/demo-resonance/databases/(default)/documents/users/alice');
    // A hyphen can't stand bare in a field path: quoted in backticks.
    expect(u.searchParams.getAll('updateMask.fieldPaths')).toEqual(['hintsSeen.`note-privacy`', 'hintsSeen.plain_key']);
    // Never makes a profile that isn't there.
    expect(u.searchParams.get('currentDocument.exists')).toBe('true');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer owner');
    // In the mask, not in the body: deleted.
    expect(JSON.parse(String(init.body))).toEqual({ fields: {} });
  });

  it('resets just before a screen with hints, for its account, and says so when the stack refuses', async () => {
    const log = vi.fn();
    const ok = vi.fn(async () => new Response('{}', { status: 200 }));
    await unspendHints({ ports: PORTS, log }, noteOpen, ok as unknown as typeof fetch);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain(`127.0.0.1:${PORTS.firestore}/`);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain('/documents/users/alice?');
    expect(log).not.toHaveBeenCalled();

    const none = vi.fn();
    await unspendHints({ ports: PORTS, log }, SCREENS.find((s) => s.id === 'home')!, none as unknown as typeof fetch);
    await unspendHints({ ports: PORTS, log }, { id: 'x', as: null, hints: ['note-privacy'] }, none as unknown as typeof fetch);
    expect(none).not.toHaveBeenCalled();

    const refused = vi.fn(async () => new Response('no', { status: 404 }));
    await unspendHints({ ports: PORTS, log }, noteOpen, refused as unknown as typeof fetch);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/card-note-open: alice's note-privacy not reset \(404/));
  });

  it.each([
    ['web.ts', /open\(page, ctx,/],
    ['android.ts', /await launch\(serial, ctx, screen\.as/],
    ['ios.ts', /launch\(udid, launchArgs\(ctx, account, screen\.route/],
    ['mac.ts', /await launch\(launchArgs\(ctx, account, screen\.route/],
  ])('%s resets a screen’s hints before it opens the screen', (file, opens) => {
    const text = source(file);
    const reset = text.indexOf('await unspendHints(ctx, screen);');
    expect(reset, `${file} never resets a screen's hints`).toBeGreaterThan(0);
    const open = text.slice(reset).search(opens);
    expect(open, `${file} opens no screen after the reset`).toBeGreaterThan(0);
    // Right before it: nothing else opened in between.
    expect(open).toBeLessThan(400);
  });
});
