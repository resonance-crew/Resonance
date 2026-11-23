import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The web's blur-to-sharp ratchet (Wave 2 #7): every remote picture lands through the shared reveal — the atoms
 * `OrganicImage`, `OrganicStoryImage`, `HandDrawnAvatar` (and the thought map's node, fade only), each a raw element
 * with `ref={revealRef}`, and `RevealImg` for everything else. A raw `<img>` / SVG `<image>` anywhere else is either
 * one of the exclusions below (drawn art, local previews, server pictures) or counted, and the count only falls.
 */
const root = resolve(__dirname, '../../..');

/** Shared components: their raw element carries the reveal's ref. */
const SHARED = [
  'src/components/atoms/RevealImg/RevealImg.tsx',
  'src/components/atoms/OrganicImage/OrganicImage.tsx',
  'src/components/atoms/OrganicImage/OrganicStoryImage.tsx',
  'src/components/atoms/HandDrawnAvatar/HandDrawnAvatar.tsx',
  'src/components/molecules/ThoughtMap/ThoughtMapNode.tsx',
];

/** Pictures that never reveal, and why. */
const EXCLUDED: { path: string; why: string }[] = [
  { path: 'src/components/sections/MessagesPage/StickerPart.tsx', why: 'stickers: drawn art whose first frame and breathing a blur would fight' },
  { path: 'src/components/sections/MessagesPage/StickerPicker.tsx', why: 'stickers and their pack icons' },
  { path: 'src/components/sections/MessagesPage/ThreadComposer.tsx', why: "the composer's local previews (and the reply it carries), already on this device" },
  { path: 'src/components/sections/LandingFilm/', why: "the landing film's own drawn world" },
  { path: 'src/components/molecules/PaperPalStill/', why: 'the paper puppets: drawn art' },
  { path: 'src/components/molecules/GetTheApp/', why: 'store badges, shipped with the page' },
  { path: 'src/components/atoms/HandDrawnImage/', why: "the writer's own picture in the making, with its own streaming blur" },
  { path: 'src/components/atoms/SquareFlag/', why: 'flags: drawn art shipped with the page' },
  { path: 'src/components/lab/', why: "the landing lab's prototypes (unlinked, noindex)" },
  { path: 'src/app/[locale]/lab/', why: "the landing lab's prototypes (unlinked, noindex)" },
];

/** Raw pictures left outside the shared reveal. May only fall. */
const RAW_LEFT = 0;

const under = (file: string, path: string) => (path.endsWith('/') ? file.startsWith(path) : file === path);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}

/** Each raw `<img` / `<image` element, with the text of its opening tag (comments aside). */
function rawPictures(text: string): string[] {
  const code = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  const tags: string[] = [];
  for (const m of code.matchAll(/<(img|image)\b/g)) {
    const end = code.indexOf('>', m.index);
    tags.push(code.slice(m.index, end < 0 ? undefined : end + 1));
  }
  return tags;
}

const files = [...sources(join(root, 'src/components')), ...sources(join(root, 'src/app'))].map((f) => ({
  rel: relative(root, f),
  text: readFileSync(f, 'utf8'),
}));

describe('every remote picture on the web lands through the shared reveal', () => {
  it('the shared components draw their picture with the reveal', () => {
    for (const path of SHARED) {
      const file = files.find((f) => f.rel === path);
      expect(file, path).toBeDefined();
      const tags = rawPictures(file!.text);
      expect(tags.length, path).toBeGreaterThan(0);
      for (const tag of tags) expect(tag, `${path}: ${tag}`).toMatch(/ref=\{(revealRef|attach)\}/);
    }
  });

  it(`leaves no more than ${RAW_LEFT} raw <img> / <image> outside them`, () => {
    const raw = files
      .filter((f) => !SHARED.includes(f.rel) && !EXCLUDED.some((e) => under(f.rel, e.path)))
      .flatMap((f) => rawPictures(f.text).map((tag) => `${f.rel}: ${tag.slice(0, 80)}`));
    expect(raw).toEqual([]);
    expect(raw.length).toBeLessThanOrEqual(RAW_LEFT);
  });

  it('every exclusion still names a file that exists', () => {
    for (const e of EXCLUDED) expect(files.some((f) => under(f.rel, e.path)), e.path).toBe(true);
  });
});
