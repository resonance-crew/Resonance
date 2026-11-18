import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// No popularity, ever (round 26 §A2.6, C11; docs/product-design-principles.md): nothing that counts what other
// people did with a card enters a path that picks cards for readers — not how often it was read, tapped, saved,
// answered or shared, nor "people who resonated with this also …". The signals the recommender reads describe one
// reader's own taste (lib/recommend/weights), and are read by that reader's id alone.
//
// A source scan, over the recommender and the landing film's picks, of the code (comments may explain the rule).

const ROOT = join(__dirname, '../../..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const SOURCES = [
  ...walk(join(ROOT, 'src/lib/recommend')).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)),
  join(ROOT, 'src/components/sections/LandingFilm/data.ts'),
];
/** The code alone: block and line comments taken out (a `//` inside a string is rare here, and only shortens the scan). */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** A card's counts of other people's acts. */
const COUNTS = /\b(readCount|resonanceCount|inviteCount|tapCount|tapsCount|saveCount|savedCount|bookmarkCount|noteCount|replyCount|shareCount|viewCount|likeCount|popularity|trending)\b/;
/** The collections where other people's acts are kept: read here only by the reader's own id. */
const ACTS = /\.collection\(\s*(?:['"`](resonanceTaps|readerSignals|notes|cardReads)['"`]|TAPS|READER_SIGNALS|CARD_READS)\s*\)([^;]*)/g;

describe('the recommender reads no popularity', () => {
  it('scans the files it means to', () => {
    const names = SOURCES.map((f) => relative(ROOT, f));
    expect(names).toEqual(expect.arrayContaining(['src/lib/recommend/funnel.ts', 'src/lib/recommend/weights.ts', 'src/lib/recommend/signals.ts', 'src/components/sections/LandingFilm/data.ts']));
  });

  it('names no card-level count in any picking path', () => {
    for (const file of SOURCES) expect(code(file), relative(ROOT, file)).not.toMatch(COUNTS);
  });

  it("reads other people's acts only by the reader's own id, never by card", () => {
    for (const file of SOURCES) {
      for (const m of code(file).matchAll(ACTS)) {
        const chain = m[2];
        expect(chain, `${relative(ROOT, file)}: ${m[0].slice(0, 80)}`).toMatch(/\.where\(\s*['"`](userId|fromUserId)['"`]\s*,\s*['"`]==['"`]/);
        expect(chain, relative(ROOT, file)).not.toMatch(/\.where\(\s*['"`]cardId['"`]/);
      }
    }
  });

  it('counts nothing across readers (no aggregation queries)', () => {
    for (const file of SOURCES) expect(code(file), relative(ROOT, file)).not.toMatch(/\.count\(\)|AggregateField|\.aggregate\(/);
  });

  it('would catch a count if one came back', () => {
    expect("select('resonanceCount')").toMatch(COUNTS);
    const byCard = ".collection('resonanceTaps').where('cardId', '==', id).get()";
    const [m] = [...byCard.matchAll(ACTS)];
    expect(m[2]).not.toMatch(/\.where\(\s*['"`](userId|fromUserId)['"`]/);
  });
});
