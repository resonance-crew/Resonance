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

describe('the firebase-admin ratchet', () => {
  it(`no more than ${MAX} files outside src/server/infra import firebase-admin`, () => {
    const found = importers();
    expect(found.length, `firebase-admin is imported outside src/server/infra by:\n${found.join('\n')}`).toBeLessThanOrEqual(MAX);
    expect(found.length, `only ${found.length} files import firebase-admin now: lower MAX in src/server/ratchet.test.ts to ${found.length}`).toBe(MAX);
  });

  it('src/server outside infra imports none', () => {
    expect(importers().filter((path) => path.startsWith(`server${sep}`))).toEqual([]);
  });
});
