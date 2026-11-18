import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relPath, sourceFiles, withoutComments } from './sourceScan';

/**
 * No inline `style` for design-system values (the resonance-ui skill's hard rule 3): typography,
 * colour, padding and radius live in CSS Modules over the tokens (`var(--…)`), so a theme, dark mode
 * and the phone's sizes reach them. Inline `style` stays fine for one-off layout (a grid template, a
 * sticky offset, a measured size). A count ratchet over `style={{ … }}` objects: each file below may
 * keep at most its number of such keys, a file not listed none, and a number that falls must be lowered
 * here. Left out (OUTSIDE): what draws without the page's stylesheet. A style object built elsewhere
 * and passed by name isn't seen — this catches the habit, not every case.
 */
const OUTSIDE: { path: string; why: string }[] = [
  { path: 'src/lib/linkImage/', why: 'the og image: next/og takes inline styles only' },
  { path: 'src/app/api/og/', why: 'the og image routes: next/og' },
  { path: 'src/app/global-error.tsx', why: 'shown when the stylesheet itself failed' },
  { path: 'src/components/lab/', why: "the landing lab's prototypes (unlinked, noindex)" },
  { path: 'src/app/[locale]/lab/', why: "the landing lab's pages (unlinked, noindex)" },
];

const COUNTS: Record<string, number> = {
  'src/app/[locale]/(app)/card/[slug]/CardDetailClient.tsx': 3,
  'src/app/[locale]/(app)/me/page.tsx': 10,
  'src/app/[locale]/(app)/settings/DeleteAccountSection.tsx': 4,
  'src/app/[locale]/(app)/settings/SettingsClient.tsx': 9,
  'src/app/[locale]/(app)/settings/page.tsx': 4,
  'src/app/[locale]/(app)/write/[id]/page.tsx': 8,
  'src/app/[locale]/curvecheck/page.tsx': 1,
  'src/app/[locale]/error.tsx': 2,
  'src/components/atoms/Divider/Divider.tsx': 2,
  'src/components/atoms/HandDrawnAvatar/HandDrawnAvatar.tsx': 4,
  'src/components/atoms/Icon/Icon.tsx': 1,
  'src/components/atoms/OrganicButton/OrganicButton.tsx': 1,
  'src/components/atoms/OrganicImage/OrganicImage.tsx': 1,
  'src/components/atoms/OrganicImage/OrganicStoryImage.tsx': 1,
  'src/components/atoms/Skeleton/Skeleton.tsx': 1,
  'src/components/molecules/CardLinkGrid/CardLinkGrid.tsx': 1,
  'src/components/molecules/CardPicker/CardPickList.tsx': 2,
  'src/components/molecules/EmbedStoryCard/EmbedStoryCard.tsx': 1,
  'src/components/molecules/InvitesInbox/InvitesInbox.tsx': 16,
  'src/components/molecules/LoadError/LoadError.tsx': 3,
  'src/components/molecules/MiniStoryCard/MiniCardGrid.tsx': 1,
  'src/components/molecules/MiniStoryCard/MiniStoryCard.tsx': 3,
  'src/components/molecules/Modal/Modal.tsx': 2,
  'src/components/molecules/PageShell/PageShell.tsx': 14,
  'src/components/molecules/SegmentedActionBar/SegmentedActionBar.tsx': 1,
  'src/components/molecules/StoryCard/StoryCard.tsx': 2,
  'src/components/molecules/TermsConsent/TermsConsent.tsx': 3,
  'src/components/sections/AboutPage/AboutArt.tsx': 1,
  'src/components/sections/AppHeader/AppHeader.tsx': 3,
  'src/components/sections/AppHeader/AppMobileNavModal.tsx': 11,
  'src/components/sections/AppHeader/BellRow.tsx': 2,
  'src/components/sections/AppHeader/MessagesEntry.tsx': 6,
  'src/components/sections/AppHeader/NotificationBell.tsx': 8,
  'src/components/sections/LandingFilm/FilmHeader.tsx': 4,
  'src/components/sections/LandingFilm/TonightGrid.tsx': 1,
  'src/components/sections/LandingFilm/World.tsx': 1,
  'src/components/sections/MessagesPage/MessagesPage.tsx': 4,
  'src/components/sections/MessagesPage/ThreadView.tsx': 1,
  'src/components/sections/SiteHeader/SiteHeader.tsx': 4,
};

const KEY = /(?:^|[,{\s])(?:color|background|backgroundColor|fontSize|fontFamily|fontWeight|lineHeight|letterSpacing|padding(?:Top|Bottom|Left|Right|Inline|Block)?|borderRadius)\s*:/g;

/** How many design-system keys the file's `style={{ … }}` objects set. */
function designKeys(source: string): number {
  const text = withoutComments(source, false);
  let n = 0;
  for (let i = text.indexOf('style={{'); i >= 0; i = text.indexOf('style={{', i + 1)) {
    let depth = 0;
    let j = i + 6;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}' && --depth === 0) break;
    }
    n += [...text.slice(i + 7, j + 1).matchAll(KEY)].length;
  }
  return n;
}

const outside = (file: string) => OUTSIDE.some((o) => (o.path.endsWith('/') ? file.startsWith(o.path) : file === o.path));

describe('inline design values only fall', () => {
  const files = sourceFiles('src', (name) => name.endsWith('.tsx')).filter((f) => !outside(relPath(f)));
  const found = Object.fromEntries(
    files.map((f) => [relPath(f), designKeys(readFileSync(f, 'utf8'))] as const).filter(([, n]) => n > 0),
  );

  it('sets no new colour, type, padding or radius in an inline style: a CSS Module over the tokens', () => {
    const over = Object.entries(found)
      .filter(([f, n]) => n > (COUNTS[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} design values inline, allowed ${COUNTS[f] ?? 0}`);
    expect(over, 'a design value in an inline style (the skill’s rule 3: CSS Modules + tokens)').toEqual([]);
  });

  it('lowers a count as soon as a value moves to CSS', () => {
    const under = Object.entries(COUNTS)
      .filter(([f, n]) => (found[f] ?? 0) < n)
      .map(([f, n]) => `${f}: ${found[f] ?? 0} now, listed as ${n}`);
    expect(under, 'fewer inline design values than listed: lower the number (or drop the file)').toEqual([]);
  });

  it('counts design keys, not layout, nested braces or comments', () => {
    expect(designKeys("<p style={{ color: 'var(--x)', padding: 12, borderRadius: 8 }} />")).toBe(3);
    expect(designKeys('<div style={{ gridTemplateColumns: `${n}fr 1fr`, top: offset }} />')).toBe(0);
    expect(designKeys("<div style={{ ...base, transform: `translate(${x}px)`, fontSize: size ? 14 : 16 }} />")).toBe(1);
    expect(designKeys("{/* style={{ color: 'red' }} */}")).toBe(0);
    expect(designKeys('<a style={{ textDecorationColor: c }} />')).toBe(0);
  });
});
