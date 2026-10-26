import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// sharp (libvips) is a native module: loading it costs a function's cold
// start tens of milliseconds and tens of megabytes. Only the routes that
// decode or encode pictures may import it; the ones that only sign a
// picture's address (a message's unfurl, a story's link previews) go through
// ./imageSigning, which needs node:crypto alone. This follows every route's
// static imports (as src/lib/ai/regions.test.ts does for OpenAI) to keep it so.

const ROOT = join(__dirname, '../../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const routes = walk(join(ROOT, 'src/app')).filter((f) => /\/route\.tsx?$/.test(f));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Static runtime imports only: `import type` brings no code, and an `import()` loads on first use, not at start. */
const IMPORT = /(?:^|\n)\s*(import|export)(\s+type)?\b[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

const reaches = new Map<string, boolean>();
function loadsSharp(file: string, seen = new Set<string>()): boolean {
  const known = reaches.get(file);
  if (known !== undefined) return known;
  if (seen.has(file)) return false;
  seen.add(file);
  let found = false;
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (m[2]) continue;
    const spec = m[3] ?? m[4];
    if (spec === 'sharp') found = true;
    const target = spec && resolveImport(file, spec);
    if (found || (target && loadsSharp(target, seen))) {
      found = true;
      break;
    }
  }
  reaches.set(file, found);
  return found;
}

describe('sharp at cold start', () => {
  it('is loaded only by the routes that decode or encode pictures', () => {
    expect(routes.filter((f) => loadsSharp(f)).map((f) => relative(ROOT, f)).sort()).toEqual([
      'src/app/api/generate-image/route.ts',
      'src/app/api/link-image/route.ts',
      'src/app/api/og/card/[id]/route.ts',
      'src/app/api/og/user/[id]/route.ts',
      'src/app/api/upload/route.ts',
      'src/app/api/v1/chat-images/route.ts',
    ]);
  });

  it('stays out of sending a message or a note, publishing and saving an edit', () => {
    for (const route of [
      'src/app/api/v1/messages/route.ts',
      'src/app/api/v1/notes/route.ts',
      'src/app/api/v1/cards/[key]/publish/route.ts',
      'src/app/api/v1/cards/[key]/edits/apply/route.ts',
    ]) {
      expect(loadsSharp(join(ROOT, route)), route).toBe(false);
    }
  });
});
