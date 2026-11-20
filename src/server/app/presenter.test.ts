import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Anonymous safety (CLAUDE.md #6, plan §3.5 #6): the presenters (src/lib/api/v1/present.ts toFeedCard, toAuthor)
// are the only place a card or a person leaves the server, and they drop an anonymous card's byline. So no
// application service puts an author's id into an answer itself: no `authorId:` key, no `{ authorId }` shorthand,
// no `...card` spread into an object literal outside the presenters. A service that needs to say who wrote a
// card asks a presenter (which knows when it may).

const APP = __dirname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Source without comments, so a doc comment naming the field doesn't count. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PUTS_AUTHOR = [
  /\bauthorId\s*:/, // { authorId: … }
  /[{,]\s*authorId\s*[,}]/, // { authorId } shorthand
  /\{\s*\.\.\.(card|c|row|data)\b/, // a card's own fields spread into a new object
];

/**
 * Services whose author ids never leave the server, each with why. This list only ever shrinks: an entry
 * whose file no longer matches fails, so it is dropped when its code changes.
 */
const INTERNAL: Record<string, string> = {
  'links.ts': "passes the card's author to the rate-limit budget (withinBudget), never into an answer",
  'recommendFeed.ts': 'reranks by authorKey(), which keys an anonymous card by its card, not its author; the funnel answers card ids',
  'recommendIndex.ts': 'writes the vector index rows (cardVectors.authorId, server-only); answers an IndexResult with no author',
};

describe('no service puts an author into an answer itself', () => {
  it('src/server/app has services to check', () => {
    expect(sources(APP).length).toBeGreaterThan(0);
  });

  for (const file of sources(APP)) {
    it(relative(APP, file), () => {
      const text = code(readFileSync(file, 'utf8'));
      const name = relative(APP, file);
      if (INTERNAL[name]) {
        expect(PUTS_AUTHOR.some((p) => p.test(text)), `${name} no longer names an author: drop it from INTERNAL`).toBe(true);
        return;
      }
      for (const pattern of PUTS_AUTHOR) {
        const line = text.split('\n').find((l) => pattern.test(l));
        expect(line, `${relative(APP, file)} builds an answer with an author's id (${pattern}): present it through toFeedCard / toAuthor`).toBeUndefined();
      }
    });
  }
});
