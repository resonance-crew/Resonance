import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Only src/server/infra may import a vendor SDK (src/server/README.md). The
// Firebase Admin SDK is counted: every non-test file under src/ outside
// src/server/infra that imports it, statically or with import(). The number
// only ever falls — a lane that empties a file of it lowers MAX in the same
// change. Phase 1 ends at 0.
const MAX = 0;

const ROOT = join(__dirname, '..');
const INFRA = join('server', 'infra') + sep;
const ADMIN_IMPORT = /from\s+['"]firebase-admin|import\(\s*['"]firebase-admin/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function importers(): string[] {
  return sources(ROOT)
    .filter((path) => !relative(ROOT, path).startsWith(INFRA))
    .filter((path) => ADMIN_IMPORT.test(readFileSync(path, 'utf8')))
    .map((path) => relative(ROOT, path))
    .sort();
}

// The routes and server code reach the database through serverCtx() (or a
// legacy facade's ctxFor(db)), never getAdminDb() of their own: every
// non-test file under src/ outside src/server, src/lib/db/firestore (where
// it is defined and re-exported) and src/app/api/v1 (its own count) that
// calls it. Only falls; Phase 1's routes lane left it at 0.
const MAX_ADMIN_DB_CALLERS = 0;
const ADMIN_DB_CALL = /\bgetAdminDb\(/;
const ADMIN_DB_EXEMPT = [join('server') + sep, join('lib', 'db', 'firestore') + sep, join('app', 'api', 'v1') + sep];

function adminDbCallers(): string[] {
  return sources(ROOT)
    .map((path) => relative(ROOT, path))
    .filter((path) => !ADMIN_DB_EXEMPT.some((dir) => path.startsWith(dir)))
    .filter((path) => ADMIN_DB_CALL.test(readFileSync(join(ROOT, path), 'utf8')))
    .sort();
}

describe('the firebase-admin ratchet', () => {
  it(`no more than ${MAX} files outside src/server/infra import firebase-admin`, () => {
    const found = importers();
    expect(found.length, `firebase-admin is imported outside src/server/infra by:\n${found.join('\n')}`).toBeLessThanOrEqual(MAX);
    expect(found.length, `only ${found.length} files import firebase-admin now: lower MAX in src/server/ratchet.test.ts to ${found.length}`).toBe(MAX);
  });

  it('src/server outside infra imports none', () => {
    expect(importers().filter((path) => path.startsWith(`server${sep}`))).toEqual([]);
  });

  it(`no more than ${MAX_ADMIN_DB_CALLERS} files outside src/server, src/lib/db/firestore and src/app/api/v1 call getAdminDb()`, () => {
    const found = adminDbCallers();
    expect(found.length, `getAdminDb() is called (use serverCtx()) by:\n${found.join('\n')}`).toBeLessThanOrEqual(MAX_ADMIN_DB_CALLERS);
    expect(found.length, `only ${found.length} files call getAdminDb() now: lower MAX_ADMIN_DB_CALLERS in src/server/ratchet.test.ts to ${found.length}`).toBe(MAX_ADMIN_DB_CALLERS);
  });
});
