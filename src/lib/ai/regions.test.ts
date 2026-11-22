import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The functions run in Hong Kong (vercel.json "regions": nearest Firestore's
// asia-east1), but OpenAI refuses requests from Hong Kong. So every route that
// can reach the OpenAI client is pinned elsewhere in vercel.json "functions".
// This follows each route's imports to keep that list complete and current.

const ROOT = join(__dirname, '../../..');
const OPENAI = join(ROOT, 'src/lib/ai/openai.ts');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  regions: string[];
  functions?: Record<string, { regions?: string[]; maxDuration?: number }>;
  crons?: { path: string; schedule: string }[];
};
/** Where OpenAI answers "unsupported_country_region_territory". */
const REFUSED = new Set(['hkg1']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The server entry points: route handlers, pages and layouts. */
const entries = walk(join(ROOT, 'src/app')).filter((f) => /\/(route|page|layout)\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Runtime imports only: `import type` / `export type` bring no code along. */
const IMPORT = /(?:^|\n)\s*(import|export)(\s+type)?\b[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const reaches = new Map<string, boolean>();
function reachesOpenAI(file: string, seen = new Set<string>()): boolean {
  if (file === OPENAI) return true;
  const known = reaches.get(file);
  if (known !== undefined) return known;
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  let found = false;
  for (const m of source.matchAll(IMPORT)) {
    if (m[2]) continue;
    const spec = m[3] ?? m[4] ?? m[5];
    const target = spec && resolveImport(file, spec);
    if (target && reachesOpenAI(target, seen)) {
      found = true;
      break;
    }
  }
  reaches.set(file, found);
  return found;
}

/** vercel.json's function globs (`*` within one path segment, `**` across). */
function globMatches(glob: string, path: string): boolean {
  const pattern = glob
    .split('**')
    .map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(path);
}

function regionsOf(path: string): string[] {
  const entry = Object.entries(vercel.functions ?? {}).find(([glob]) => globMatches(glob, path));
  return entry?.[1].regions ?? vercel.regions;
}

const openAIRoutes = entries.filter((f) => reachesOpenAI(f)).map((f) => relative(ROOT, f));

describe('function regions', () => {
  it('finds the routes that call OpenAI (publishing, tags, insight, illustrations, recommendations)', () => {
    expect(openAIRoutes).toContain('src/app/api/v1/cards/[key]/publish/route.ts');
    expect(openAIRoutes).toContain('src/app/api/generate-image/route.ts');
    expect(openAIRoutes).not.toContain('src/app/api/cards/latest/route.ts');
  });

  // The evening's push only reads the picks; the warm-up an hour before builds them.
  it('keeps the pick push beside Firestore, and the warm-up that builds the picks away from Hong Kong', () => {
    expect(openAIRoutes).not.toContain('src/app/api/cron/push-picks/route.ts');
    expect(openAIRoutes).toContain('src/app/api/cron/warm-picks/route.ts');
    expect(regionsOf('src/app/api/cron/push-picks/route.ts')).toEqual(['hkg1']);
    expect(regionsOf('src/app/api/cron/warm-picks/route.ts')).toEqual(['hnd1']);
    expect(openAIRoutes).not.toContain('src/app/api/v1/me/notifications/route.ts');
  });

  // Round 26: the weekly read summary counts reading records and writes bell rows; the tap, its list and the
  // reading reports reach no model either. All stay beside Firestore.
  it('keeps the weekly read summary, the resonance tap and the reading reports in Hong Kong', () => {
    for (const route of [
      'src/app/api/cron/read-summary/route.ts',
      'src/app/api/v1/cards/[key]/tap/route.ts',
      'src/app/api/v1/cards/[key]/taps/route.ts',
      // Round 27: the pick among a card's passages, and the card itself (which carries them), read what was stored.
      'src/app/api/v1/cards/[key]/tap/passage/route.ts',
      'src/app/api/v1/cards/[key]/route.ts',
      'src/app/api/v1/cards/[key]/reading/route.ts',
    ]) {
      expect(entries.map((f) => relative(ROOT, f)), route).toContain(route);
      expect(openAIRoutes, route).not.toContain(route);
      expect(regionsOf(route), route).toEqual(['hkg1']);
    }
    expect(vercel.crons ?? []).toContainEqual({ path: '/api/cron/read-summary', schedule: '0 1 * * 1' });
  });

  // Round 26 §A1.8: the card reading is a reasoning model reading the whole story, under one deadline of 100 s after
  // a publish's response; edits are read again by a daily cron. Vercel Hobby runs a cron once a day at most — an
  // hourly expression fails the deploy (D1).
  it("gives publishing and applying 120 s, and pins the daily re-reading of owed cards away from Hong Kong", () => {
    for (const route of ['src/app/api/v1/cards/[key]/publish/route.ts', 'src/app/api/v1/cards/[key]/edits/apply/route.ts']) {
      expect(readFileSync(join(ROOT, route), 'utf8')).toMatch(/export const maxDuration = 120;/);
    }
    const cron = 'src/app/api/cron/index-cards/route.ts';
    expect(openAIRoutes).toContain(cron);
    expect(regionsOf(cron)).toEqual(['hnd1']);
    expect(vercel.functions?.['src/app/api/cron/index-cards/route.ts']).toEqual({ regions: ['hnd1'], maxDuration: 300 });
    expect(vercel.crons ?? []).toContainEqual({ path: '/api/cron/index-cards', schedule: '0 10 * * *' });
    // Once a day or rarer, every one of them: a fixed minute and hour.
    for (const { path, schedule } of vercel.crons ?? []) expect(schedule, path).toMatch(/^\d{1,2} \d{1,2} \S+ \S+ \S+$/);
    // Removing a card or an account reaches no model (they name the readings' collection from a module of its own).
    for (const route of ['src/app/api/cron/purge-accounts/route.ts', 'src/app/api/cron/push-picks/route.ts', 'src/app/[locale]/page.tsx']) {
      if (existsSync(join(ROOT, route))) expect(openAIRoutes, route).not.toContain(route);
    }
  });

  it('runs none of them where OpenAI refuses requests', () => {
    const refused = openAIRoutes.filter((route) => regionsOf(route).some((r) => REFUSED.has(r)));
    expect(refused).toEqual([]);
  });

  it('pins only routes that need it (a stale pin would keep a route far from Firestore)', () => {
    for (const glob of Object.keys(vercel.functions ?? {})) {
      expect(openAIRoutes.some((route) => globMatches(glob, route)), glob).toBe(true);
    }
  });

  it('gives a pinned route the same time limit as its own maxDuration', () => {
    for (const [glob, config] of Object.entries(vercel.functions ?? {})) {
      for (const route of openAIRoutes.filter((r) => globMatches(glob, r))) {
        const own = readFileSync(join(ROOT, route), 'utf8').match(/export const maxDuration = (\d+)/)?.[1];
        expect(config.maxDuration, route).toBe(own === undefined ? undefined : Number(own));
      }
    }
  });
});
