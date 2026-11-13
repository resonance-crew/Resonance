import { describe, expect, it } from 'vitest';
import { attention, groupErrors, parseIntegrity, parseModeration, renderReport, type Facts } from './report';

// What the two scripts print (scripts/moderation/reports.ts list, scripts/integrity.ts), with made-up ids.
const MODERATION = `r_b2  2026-11-12T08:00:00.000Z  [open]  spam  card:c1  against u1  by u2
    card “A title” by u1, public
r_a1  2026-11-10T01:00:00.000Z  [open]  harassment  message:p/m  against u3  by u4  (context p)
    “they kept writing”
    message: …
`;
const INTEGRITY = `demo-resonance: 12 cards, 4 users, 2 card links

✓ cards: publishedAt in the future: 0
✗ cards: anonymous and for connections only: 2
    fix: leave them; they read as private
    c1
    c2
✓ notifications: createdAt in the future (pinned to the top of a bell): 0
`;

const facts = (over: Partial<Facts> = {}): Facts => ({
  at: new Date('2026-11-14T00:30:00.000Z'),
  ci: { ok: true, value: [{ status: 'completed', conclusion: 'success', url: 'https://github.com/x/actions/runs/9', headSha: 'f'.repeat(40), createdAt: '2026-11-13T10:00:00Z', displayTitle: 'fix: a thing' }] },
  deployment: { ok: true, value: { url: 'resonance-x.vercel.app', state: 'READY', sha: 'f'.repeat(40), createdAt: Date.parse('2026-11-13T10:02:00Z') } },
  errors: { ok: true, value: [] },
  errorsSince: '24h',
  stores: [
    { source: 'App Store Connect', unavailable: 'by hand' },
    { source: 'Google Play', unavailable: 'Play Console → 發布總覽' },
  ],
  data: null,
  openIssue: { ok: true, value: null },
  ...over,
});

describe('parsers', () => {
  it('counts the open reports and finds the oldest', () => {
    expect(parseModeration(MODERATION)).toEqual({ open: 2, oldest: '2026-11-10T01:00:00.000Z' });
    expect(parseModeration('No reports.\n')).toEqual({ open: 0, oldest: null });
  });

  it('reads the integrity checks and their counts', () => {
    const i = parseIntegrity(INTEGRITY);
    expect(i.header).toBe('demo-resonance: 12 cards, 4 users, 2 card links');
    expect(i.findings).toEqual([
      { check: 'cards: publishedAt in the future', count: 0 },
      { check: 'cards: anonymous and for connections only', count: 2 },
      { check: 'notifications: createdAt in the future (pinned to the top of a bell)', count: 0 },
    ]);
  });

  it('groups error lines by status and path, ids folded', () => {
    const g = groupErrors([
      { requestPath: '/api/v1/cards/AbCdEfGhIjKlMnOpQr/read', responseStatusCode: 500, timestamp: 2 },
      { requestPath: '/api/v1/cards/ZyXwVuTsRqPoNmLkJi/read', responseStatusCode: 500, timestamp: 5 },
      { requestPath: '/api/recommend/feed', responseStatusCode: 504, timestamp: 3 },
    ]);
    expect(g).toEqual([
      { key: '500 /api/v1/cards/:id/read', count: 2, last: 5 },
      { key: '504 /api/recommend/feed', count: 1, last: 3 },
    ]);
  });
});

describe('report', () => {
  it('says OK when nothing needs a person, and leaves data out unless asked', () => {
    const md = renderReport(facts());
    expect(md.split('\n')[0]).toBe('# Resonance daily check 2026-11-14: OK');
    expect(md).toContain('- success · ffffffff · 2026-11-13T10:00:00Z · fix: a thing — https://github.com/x/actions/runs/9');
    expect(md).toContain('- latest: READY · ffffffff · 2026-11-13T10:02:00Z · resonance-x.vercel.app');
    expect(md).toContain('- error logs, 24h: none');
    expect(md).toContain('- Google Play: not read automatically — Play Console → 發布總覽');
    expect(md).toContain("- not checked (run with `--data production`");
    expect(md).toContain('- none open');
  });

  it('lists what to look at: red CI, errors, a rejection, reports, findings, what it could not read', () => {
    const f = facts({
      ci: { ok: true, value: [{ status: 'completed', conclusion: 'failure', url: 'u', headSha: 'a'.repeat(40) }] },
      errors: { ok: true, value: [{ requestPath: '/api/x', responseStatusCode: 500, timestamp: 1 }] },
      deployment: { ok: false, error: 'Error: Not authorized' },
      stores: [{ source: 'App Store Connect', states: [{ store: 'App Store', platform: 'IOS', version: '2.5.1', state: 'REJECTED' }, { store: 'App Store', platform: 'MAC_OS', version: '2.5.1', state: 'WAITING_FOR_REVIEW' }] }],
      data: { target: 'emulator', moderation: { ok: true, value: parseModeration(MODERATION) }, integrity: { ok: true, value: parseIntegrity(INTEGRITY) } },
      openIssue: { ok: true, value: { number: 12, url: 'https://github.com/x/issues/12' } },
    });
    expect(attention(f)).toEqual([
      'CI red on main aaaaaaaa: u',
      "Vercel: couldn't read (Error: Not authorized)",
      '1 production error log line(s) in 24h',
      'App Store IOS 2.5.1: REJECTED',
      '2 open report(s) in the moderation queue',
      'Integrity: 1 check(s) with findings',
    ]);
    const md = renderReport(f);
    expect(md.split('\n')[0]).toBe('# Resonance daily check 2026-11-14: 6 to look at');
    expect(md).toContain('  - 1× `500 /api/x`');
    expect(md).toContain('- App Store MAC_OS 2.5.1: WAITING_FOR_REVIEW');
    expect(md).toContain('- moderation queue: 2 open, oldest 2026-11-10T01:00:00.000Z');
    expect(md).toContain('  - 2 · cards: anonymous and for connections only');
    expect(md).toContain('- one is open already: #12 https://github.com/x/issues/12 — add to it, open no other');
    expect(md).toContain('read-only: gh, vercel, emulator data');
  });

  it('no CI run on main is something to look at', () => {
    expect(attention(facts({ ci: { ok: true, value: [] } }))).toEqual(['CI: no run on main']);
  });
});
