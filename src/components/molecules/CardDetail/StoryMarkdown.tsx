'use client';

import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Element, ElementContent } from 'hast';
import { createContext, memo, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicStoryImage } from '@/components/atoms/OrganicImage/OrganicStoryImage';
import { CardEmbedLink } from '@/components/molecules/EmbedStoryCard/CardEmbedLink';
import { StoryLinkCard } from '@/components/molecules/StoryLinkCard/StoryLinkCard';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import { StoryTable } from './StoryTable';
import type { LinkPreview } from '@/lib/db/types';
import { isBlankParagraph } from '@/lib/markdown/blankLines';
import { storyTooComplex } from '@/lib/markdown/storyLimits';
import { SITE_HOSTS, soleLinkParagraphs, unfurlable } from '@/lib/links/storyLinks';
import { seedFromString } from '@/lib/design/prng';
import { storyLinkWaveVars } from '@/lib/design/storyLinkWave';
import { useLinkWaveInk } from '@/lib/design/useAppearance';
import { rehypeLatinMarks } from '@/lib/markdown/rehypeLatinMarks';
import { storyType, type StoryScript } from '@/lib/text/script';
import '@/styles/story.css';
import styles from './StoryMarkdown.module.css';

/**
 * The link cards this story draws: which paragraphs (by where they start in
 * the source) are standalone links and under which key, and the previews by
 * key. Computed once per story by StoryMarkdown, read by each paragraph.
 */
interface StoryLinkCards {
  keys: ReadonlyMap<number, string>;
  previews: ReadonlyMap<string, LinkPreview>;
}
const StoryLinkCardsContext = createContext<StoryLinkCards | null>(null);

/** A story's link in its pen wave, the wave in the ink the page's theme and scheme give it. */
function StoryLink({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const ink = useLinkWaveInk();
  return (
    <a
      {...rest}
      href={href}
      {...(toOtherSite(href) ? AWAY : {})}
      className="story-link"
      style={storyLinkWaveVars(href ?? '', ink) as CSSProperties}
    >
      {children}
    </a>
  );
}

/**
 * How many card links a story draws as cards — the server's EMBED_LIMIT
 * (lib/api/v1/embeds), which caps what a page's include=embeds reads. Each
 * card past it would read its own card: a long story of card links would
 * make every reader's browser read thousands. The rest stay plain links.
 */
export const STORY_EMBED_MAX = 30;
/** The order in which this story's card-link paragraphs come (by source offset), for STORY_EMBED_MAX. */
const EmbedOrderContext = createContext<{ source: string; order: Map<number, number> } | null>(null);

/** The paragraph's only element child (ignoring whitespace), if any. */
function soleElementChild(node: Element | undefined): Element | null {
  if (!node) return null;
  const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const only = kids.length === 1 ? kids[0] : null;
  return only && only.type === 'element' ? only : null;
}

function hastText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(hastText).join('');
  return '';
}

/**
 * Our own hosts — the same in the server's render and the browser's (the page
 * is drawn on both): the site's names and the deployment's own address.
 */
const OWN_HOSTS: readonly string[] = (() => {
  const hosts = [...SITE_HOSTS];
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) hosts.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname);
  } catch {
    // Not a URL: nothing to add.
  }
  return hosts;
})();

/** A link to another site's page (http or https, a host not ours) — not a page of ours, an anchor or a mail address. */
function toOtherSite(href: string | undefined): boolean {
  if (!href) return false;
  try {
    // Read as the browser will: '//host' and '/\\host' are other sites too, a path is ours.
    const url = new URL(href, `https://${OWN_HOSTS[0]}`);
    return /^https?:$/.test(url.protocol) && !OWN_HOSTS.includes(url.hostname.replace(/\.$/, '').toLowerCase());
  } catch {
    return false;
  }
}

/** How a link to another site opens, as its link card does: a tab of its own, sending no referrer and vouching for nothing. */
const AWAY = { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } as const;

/**
 * Whether a story picture is drawn: one on our own host or a host under it (stored pictures are on
 * img.<site>), one written into the story (data:image/), or a path of ours. Any other is shown as a
 * link the reader opens on purpose: a picture elsewhere is fetched by every reader's browser the
 * moment the story opens, and its address, browser and the time go to whoever runs that host — an
 * anonymous card's author too, on the page their notification opens. The apps keep the same rule
 * (their StoryPictures). Judged as the browser will fetch it, by the URL parser.
 */
export function drawnPicture(src: string): boolean {
  if (/^data:image\//i.test(src)) return true;
  let url: URL;
  try {
    url = new URL(src, `https://${OWN_HOSTS[0]}`);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1')) return true; // the emulators' storage
  return OWN_HOSTS.some((own) => host === own || host.endsWith(`.${own}`));
}

const components: Components = {
  // A story's `#` is drawn as the reader's h2, and is one: the page has one h1, the card's title.
  h1: ({ node: _node, ...rest }) => <h2 {...rest} />,
  // A table scrolls sideways in a box of its own; each cell's words wrap between 4em and 18em (story.css).
  // Its pen rules are seeded by where it sits in the story, so a story draws its tables the same way every time.
  table: ({ node, children }) => <StoryTable seed={node?.position?.start.offset ?? 0}>{children}</StoryTable>,
  // Every cell starts at the start edge (round 9 §6): the alignment GFM writes on a cell from the
  // delimiter row's colons (`style="text-align:…"`, or `align`) is left in the source, not drawn.
  th: ({ node: _node, children, style: _style, align: _align, ...rest }) => (
    <th {...rest}>
      <div className="story-cell">{children}</div>
    </th>
  ),
  td: ({ node: _node, children, style: _style, align: _align, ...rest }) => (
    <td {...rest}>
      <div className="story-cell">{children}</div>
    </td>
  ),
  // Links wear the pen's wavy underline as a repeating background, so a link
  // that wraps gets a stroke under every line (OrganicLink's absolutely
  // positioned svg can't follow a wrapped inline box). One to another site
  // opens in a tab of its own; one to our pages stays in this one.
  a: ({ node: _node, href, children, ...rest }) => (
    <StoryLink {...rest} href={href}>
      {children}
    </StoryLink>
  ),
  // Replace the flat accent border with a hand-drawn vertical curve.
  blockquote: ({ children }) => (
    <blockquote>
      <Divider orientation="vertical" seed={5} color="var(--color-terracotta-light)" spacing={0} />
      <div className={styles.blockquoteBody}>{children}</div>
    </blockquote>
  ),
  // Replace the default flat rule with the theme's thin wavy pen line, with
  // the story's rule gap above and below (story.css --s-rule).
  hr: () => <Divider seed={23} spacing="var(--s-rule)" />,
  // Story images get the same hand-drawn curved clip as the cover, hugging
  // the photo's natural size. Spans only, so it stays valid inside <p>.
  img: ({ src, alt }) => {
    const url = String(src ?? '');
    if (!drawnPicture(url)) {
      // Not ours: a link to it, opened on purpose, never a fetch on opening the story.
      return url ? (
        <a href={url} {...AWAY} className="story-link" style={storyLinkWaveVars(url) as CSSProperties}>
          {alt || url}
        </a>
      ) : (
        <>{alt}</>
      );
    }
    return <OrganicStoryImage className={styles.storyImage} src={url} alt={alt ?? ''} seed={seedFromString(url)} />;
  },
  p: StoryParagraph,
};

/** Whether the card-link paragraph at `offset` is among the story's first STORY_EMBED_MAX (rendered in reading order). */
function withinEmbedMax(embeds: { order: Map<number, number> } | null, offset: number | undefined): boolean {
  if (!embeds || offset == null) return true;
  const { order } = embeds;
  let n = order.get(offset);
  if (n === undefined) {
    n = order.size;
    order.set(offset, n);
  }
  return n < STORY_EMBED_MAX;
}

/**
 * Paragraphs that hold a single card link become that card as a block (the
 * shared card a thread draws, in a link card's container); a paragraph that
 * is a single web link becomes that page's link card (the server's preview,
 * else its host over its address); a paragraph holding a single photo becomes an image block
 * with its own breathing room (a photo should never touch the sentence above
 * it, and nobody should have to type blank lines to get that). A paragraph
 * the writer deliberately left blank renders as extra space. Everything else
 * stays prose.
 */
function StoryParagraph({ node, children }: { children?: ReactNode } & ExtraProps) {
  const cards = useContext(StoryLinkCardsContext);
  const order = useContext(EmbedOrderContext);
  const sole = soleElementChild(node);
  if (sole?.tagName === 'a') {
    const href = String(sole.properties?.href ?? '');
    if (href.startsWith('/card/') && withinEmbedMax(order, node?.position?.start.offset)) {
      return (
        <div className={`${styles.embedBlock} story-embed`}>
          <CardEmbedLink href={href} title={hastText(sole)} />
        </div>
      );
    }
  }
  // Which paragraphs are standalone links is the server's rule, read off the
  // same source (lib/links/storyLinks), so a bare `www.` address or one GFM
  // linkifies differently still finds its preview — or, rightly, none.
  const offset = node?.position?.start.offset;
  const key = cards && offset != null ? cards.keys.get(offset) : undefined;
  const preview = key ? cards!.previews.get(key) : undefined;
  if (preview) {
    return (
      <div className={`${styles.embedBlock} story-embed`}>
        <StoryLinkCard preview={preview} />
      </div>
    );
  }
  // A standalone address with no stored preview (a private or never-published card, an older build's story, a
  // page that gave none) is still the card its writer chose — the writer's quiet card, nothing fetched (round 16
  // review S3); our own pages and bare IP addresses stay links, as the writer keeps them.
  if (key && unfurlable(key)) {
    return (
      <div className={`${styles.embedBlock} story-embed`}>
        <StoryLinkCard url={key} />
      </div>
    );
  }
  if (sole?.tagName === 'img') {
    return <div className={`${styles.imageBlock} story-picture`}>{children}</div>;
  }
  if (node && isBlankParagraph(node.children.map(hastText).join(''))) {
    return <div className={styles.blankLine} aria-hidden="true" />;
  }
  return <p>{children}</p>;
}

/**
 * A story too costly to read as Markdown (lib/markdown/storyLimits: nested
 * thousands deep, or thousands of delimiters in a paragraph): its words, a
 * paragraph per blank-line block, its line breaks kept.
 */
function StoryWords({ source }: { source: string }) {
  return source
    .split(/\n[ \t\r]*\n/)
    .filter((block) => block.trim())
    .map((block, i) => (
      <p key={i} className={styles.words}>
        {block}
      </p>
    ));
}

// The plugin lists are the same objects on every render (react-markdown takes them as props).
const REMARK_PLUGINS = [remarkGfm];
const LATIN_PLUGINS = [rehypeSlug];
const CJK_PLUGINS = [rehypeSlug, rehypeLatinMarks];

export interface StoryMarkdownProps {
  source: string;
  /**
   * How the story is set (src/styles/story.css): its script and the language
   * of its words. The card page passes both, read off the title and story
   * together (lib/text/script storyType) — a `script` with no `lang` is a
   * story whose language can't be named, and gets no tag; without a script
   * both are read off the story alone. `lang` goes on this root only — never
   * on what is around the story, which is in the reader's own language.
   */
  script?: StoryScript;
  lang?: string;
  /** The phone's numbers at any width — a side panel (the writer's original card). */
  density?: 'compact';
}

/**
 * Renders a card's story (stored as Markdown) into prose, set by
 * src/styles/story.css (.story-prose — the writer and the apps' editor set a
 * story with the same rules). `rehype-slug` adds `id`s to headings so the
 * Table of Contents can anchor-scroll to them. The page may provide its
 * card's link previews (StoryLinkPreviewsContext); a standalone link with one
 * is drawn as its link card, and one without as the writer's quiet card (its
 * host over its address).
 *
 * Parsing a story is the costliest thing a card page does in the browser, so
 * it happens only when the story, how it is set, or its previews change —
 * not on each of the page's own renders (auth settling, the lists around the
 * card arriving, the reader scrolling the byline out of view). What a story
 * draws that depends on the page — its embedded cards — reads the page's
 * context itself and updates on its own.
 */
export const StoryMarkdown = memo(function StoryMarkdown({ source, script, lang, density }: StoryMarkdownProps) {
  const previews = useContext(StoryLinkPreviewsContext);
  // Parsed again (as CommonMark, like the server) only when the story holds an address at all (soleLinkParagraphs
  // looks before it parses): a standalone one is a card, with its preview or without.
  const keys = useMemo(() => soleLinkParagraphs(source), [source]);
  const cards = useMemo<StoryLinkCards | null>(
    () => (keys.size ? { keys, previews: new Map((previews ?? []).map((p) => [p.url, p])) } : null),
    [keys, previews],
  );
  // The same in the server's render and the browser's: a pure reading of the source.
  const read = useMemo(() => (script ? null : storyType('', source)), [script, source]);
  const setAs = script ?? read?.script;
  // A CJK story sets an apostrophe inside a Latin word in its Latin face (after the slugs, read from the words as they are).
  const rehypePlugins = setAs === 'latin' ? LATIN_PLUGINS : CJK_PLUGINS;
  // A new story, a new count.
  const embedOrder = useMemo(() => ({ source, order: new Map<number, number>() }), [source]);
  const asWords = useMemo(() => storyTooComplex(source), [source]);
  return (
    <div className="story-prose" data-script={setAs} data-density={density} lang={read ? read.lang : lang}>
      {asWords ? (
        <StoryWords source={source} />
      ) : (
        <StoryLinkCardsContext.Provider value={cards}>
          <EmbedOrderContext.Provider value={embedOrder}>
            <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={rehypePlugins} components={components}>
              {source}
            </Markdown>
          </EmbedOrderContext.Provider>
        </StoryLinkCardsContext.Provider>
      )}
    </div>
  );
});
