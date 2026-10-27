// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, renderWithIntl, screen } from '@/../test/render';
import fixture from '../../../../native/fixtures/story-link-cards.json';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import type { LinkPreview } from '@/lib/db/types';
import { BLANK_PARAGRAPH } from '@/lib/markdown/blankLines';
import { StoryMarkdown } from './StoryMarkdown';

// A card embed reads its card; here it only has to be told apart from a link card.
vi.mock('@/components/molecules/EmbedStoryCard/CardEmbedLink', () => ({
  CardEmbedLink: ({ href }: { href: string }) => <span data-testid="card-embed">{href}</span>,
}));

// react-markdown as it is, counting each time it parses and renders a story.
const markdown = vi.hoisted(() => ({ parses: 0 }));
vi.mock('react-markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-markdown')>();
  const Real = actual.default;
  return {
    ...actual,
    default: (props: Parameters<typeof Real>[0]) => {
      markdown.parses++;
      return <Real {...props} />;
    },
  };
});

describe('StoryMarkdown', () => {
  it('gives a photo its own block, so it never runs into the sentence above', () => {
    renderWithIntl(
      <StoryMarkdown source={'On the last day it rained.\n\n![postbox](https://img.resonance.channel/x.webp)\n\nI ran.'} />
    );
    const img = screen.getByAltText('postbox');
    // Out of the paragraph flow entirely: the block owns the spacing, so the
    // writer never has to type blank lines around a picture.
    expect(img.closest('p')).toBeNull();
    expect(img.closest('[class*="imageBlock"]')).not.toBeNull();
  });

  it('renders a line the writer deliberately left blank as space', () => {
    const { container } = renderWithIntl(
      <StoryMarkdown source={`above\n\n${BLANK_PARAGRAPH}\n\nbelow`} />
    );
    expect(container.querySelector('[class*="blankLine"]')).not.toBeNull();
    // The marker itself is never read out or copied as text.
    expect(screen.queryByText(BLANK_PARAGRAPH)).toBeNull();
  });

  it('leaves ordinary prose as paragraphs', () => {
    const { container } = renderWithIntl(<StoryMarkdown source={'one\n\ntwo'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('underlines a link with the pen wave, per link, and no straight rule', () => {
    renderWithIntl(<StoryMarkdown source={'see [here](https://example.com/a) and [there](https://example.com/b)'} />);
    const a = screen.getByRole('link', { name: 'here' });
    const b = screen.getByRole('link', { name: 'there' });
    expect(a.className).toMatch(/link/);
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    const wa = a.style.getPropertyValue('--wave');
    expect(wa).toContain('data:image/svg+xml');
    expect(a.style.getPropertyValue('--wave-strong')).toContain('stroke-opacity');
    expect(a.style.getPropertyValue('--wave-size')).toBe('36px 6px');
    expect(b.style.getPropertyValue('--wave')).not.toBe(wa);
  });

  // As a link card does: another site's page opens in a tab of its own, sending no referrer and vouching for
  // nothing; our own pages, a heading's anchor and a mail address stay where they are.
  it('opens a link to another site in a new tab, and keeps links to our pages in this one', () => {
    renderWithIntl(
      <StoryMarkdown
        source={
          'I walked [slowly](https://example.com/walk) to [her page](https://resonance.channel/zh-TW/u/ana), ' +
          '[the top](#top), [a card](/card/rain-walk) and [mail](mailto:a@example.com), past https://www.example.org/x.'
        }
      />,
    );
    for (const name of ['slowly', 'https://www.example.org/x']) {
      const away = screen.getByRole('link', { name });
      expect(away).toHaveAttribute('target', '_blank');
      expect(away.getAttribute('rel')!.split(' ').sort()).toEqual(['nofollow', 'noopener', 'noreferrer', 'ugc']);
    }
    for (const name of ['her page', 'the top', 'a card', 'mail']) {
      const here = screen.getByRole('link', { name });
      expect(here).not.toHaveAttribute('target');
      expect(here).not.toHaveAttribute('rel');
    }
  });

  // The browser reads '//host' as another site: it opens as one, not in this tab vouched for.
  it('opens a protocol-relative link as another site', () => {
    renderWithIntl(<StoryMarkdown source={'See [this](//evil.example/x) and [that](//resonance.channel/en).'} />);
    expect(screen.getByRole('link', { name: 'this' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'that' })).not.toHaveAttribute('target');
  });

  // Each card past the server's cap would read its own card in every reader's browser.
  it('draws at most 30 card links as cards; the rest stay links', () => {
    const source = Array.from({ length: 40 }, (_, i) => `[card ${i}](/card/c${i})`).join('\n\n');
    renderWithIntl(<StoryMarkdown source={source} />);
    expect(screen.getAllByTestId('card-embed')).toHaveLength(30);
    expect(screen.getByRole('link', { name: 'card 39' })).toHaveAttribute('href', expect.stringContaining('/card/c39'));
  });
});

// A story is set by src/styles/story.css, which the writer and the apps' editor share:
// the root says how (its script, its density) and in which language its words are,
// and its blocks carry the hooks the shared rules space and set.
describe('StoryMarkdown pictures', () => {
  it("draws only our own pictures: one elsewhere is a link the reader opens, never a fetch on opening the story", () => {
    renderWithIntl(
      <StoryMarkdown
        source={[
          '![ours](https://img.resonance.channel/covers/a.webp)',
          '![written in](data:image/png;base64,iVBORw0KGgo=)',
          '![a path](/api/emulator-storage/x.webp)',
          '![elsewhere](https://pictures.example.invalid/p.png)',
          '![](https://img.resonance.channel.example.invalid/p.png)',
          '![dressed up](https://img.resonance.channel@pictures.example.invalid/p.png)',
        ].join('\n\n')}
      />,
    );
    expect(screen.getByAltText('ours')).toHaveAttribute('src', 'https://img.resonance.channel/covers/a.webp');
    expect(screen.getByAltText('written in')).toBeInTheDocument();
    expect(screen.getByAltText('a path')).toBeInTheDocument();
    for (const name of ['elsewhere', 'https://img.resonance.channel.example.invalid/p.png', 'dressed up']) {
      expect(screen.queryByAltText(name)).toBeNull();
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
    }
    expect(document.querySelectorAll('img')).toHaveLength(3);
  });
});

describe('StoryMarkdown type', () => {
  const root = (container: HTMLElement) => container.querySelector('.story-prose')!;

  it('sets the story by its own script, its language on the story alone', () => {
    const zh = renderWithIntl(<StoryMarkdown source={'那天早上下著小雨，我站在操場邊，看著跑道上的水窪。'} />);
    expect(root(zh.container)).toHaveAttribute('data-script', 'cjk');
    expect(root(zh.container)).toHaveAttribute('lang', 'zh-TW');
    expect(root(zh.container)).not.toHaveAttribute('data-density');
    zh.unmount();

    const en = renderWithIntl(<StoryMarkdown source={'The water was too hot, but it was the first morning that felt like mine. 阿嬤 said nothing.'} />);
    expect(root(en.container)).toHaveAttribute('data-script', 'latin');
    expect(root(en.container)).toHaveAttribute('lang', 'en');
  });

  it('takes the script, language and density the page read off the title and story together', () => {
    const { container } = renderWithIntl(<StoryMarkdown source={'雨'} script="latin" lang="en" density="compact" />);
    expect(root(container)).toHaveAttribute('data-script', 'latin');
    expect(root(container)).toHaveAttribute('lang', 'en');
    expect(root(container)).toHaveAttribute('data-density', 'compact');
    // The language is the story's alone: nothing outside the root claims it.
    expect(container.querySelectorAll('[lang]')).toHaveLength(1);
  });

  it('marks its links, pictures and cards for the shared rules', () => {
    const { container } = renderWithIntl(
      <StoryLinkPreviewsContext.Provider value={[previewOf('https://example.com/rain')]}>
        <StoryMarkdown source={'see [here](https://example.com/a)\n\n![postbox](https://img.resonance.channel/x.webp)\n\n[A card](/card/a-quiet-night)\n\nhttps://example.com/rain'} />
      </StoryLinkPreviewsContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'here' })).toHaveClass('story-link');
    expect(screen.getByAltText('postbox').closest('.story-picture')).not.toBeNull();
    expect(screen.getByTestId('card-embed').closest('.story-embed')).not.toBeNull();
    // A link card is a block the prose's type stops at, not a story link.
    const card = screen.getByRole('link', { name: 'Open link: example.com' });
    expect(card.closest('.story-embed')).not.toBeNull();
    expect(card).not.toHaveClass('story-link');
    expect(container.querySelectorAll('.story-embed')).toHaveLength(2);
  });

  // The page's one h1 is the card's title; a story's `#` is its first rank of heading.
  it('renders a story’s # as an h2, its ToC anchor kept', () => {
    const { container } = renderWithIntl(<StoryMarkdown source={'# 出發之前\n\n那天早上下著小雨。\n\n## 0 公尺'} />);
    expect(container.querySelector('h1')).toBeNull();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['出發之前', '0 公尺']);
    expect(headings[0].id).toBeTruthy();
  });

  // A CJK face draws ‘ ’ full-width, a half-em hole inside don’t.
  it('sets an apostrophe inside a Latin word apart in a CJK story — and never in code or in a Latin story', () => {
    const zh = renderWithIntl(
      <StoryMarkdown source={'教練只說：don’t rush. 他’s 不算，‘OK’ 也不算。\n\n## rock’n’roll 那年\n\n`can’t`'} />,
    );
    const marks = Array.from(zh.container.querySelectorAll('.story-latin-mark'));
    expect(marks.map((m) => m.textContent)).toEqual(['’', '’', '’']);
    expect(marks[0].parentElement!.tagName).toBe('P');
    expect(marks[1].closest('h2')).not.toBeNull();
    // The words read as they were written, the heading's anchor too.
    expect(screen.getByText(/教練只說/).textContent).toBe('教練只說：don’t rush. 他’s 不算，‘OK’ 也不算。');
    expect(zh.container.querySelector('h2')!.id).toBe('rocknroll-那年');
    expect(zh.container.querySelector('code')!.innerHTML).toBe('can’t');
    zh.unmount();

    const en = renderWithIntl(<StoryMarkdown source={'I don’t know why the kettle ticks before it sings.'} />);
    expect(en.container.querySelector('.story-prose')).toHaveAttribute('data-script', 'latin');
    expect(en.container.querySelectorAll('.story-latin-mark')).toHaveLength(0);
  });

  it('lets a card or link card keep its own type: the prose’s tracking and justification stop at its edge', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/story.css'), 'utf8');
    expect(css).toMatch(/\.story-prose :where\(\.story-embed\) \{[^}]*letter-spacing: normal;[^}]*text-align: start;/);
  });
});

const previewOf = (url: string, extra: Partial<LinkPreview> = {}): LinkPreview => ({ url, title: `Title of ${url}`, ...extra });

function renderStory(source: string, previews: LinkPreview[] | null) {
  return renderWithIntl(
    <StoryLinkPreviewsContext.Provider value={previews}>
      <StoryMarkdown source={source} />
    </StoryLinkPreviewsContext.Provider>,
  );
}

/** The addresses of the link cards drawn, in order, each once. */
const cardLinks = () => [
  ...new Set(screen.queryAllByRole('link', { name: /^Open link:/ }).map((a) => a.getAttribute('href'))),
];

describe('StoryMarkdown link cards', () => {
  interface Case {
    id: string;
    markdown: string;
    links: string[];
    inline?: string[];
    webDrawsNone?: boolean;
  }

  // The rule shared with the server and the apps: given a preview for every
  // link the server stores and for every link that must stay inline, the
  // reader draws exactly the stored ones as cards.
  it.each((fixture.cases as Case[]).map((c) => [c.id, c] as const))('%s (native/fixtures/story-link-cards.json)', (_id, c) => {
    renderStory(c.markdown, [...c.links, ...(c.inline ?? [])].map((url) => previewOf(url)));
    expect(cardLinks()).toEqual(c.webDrawsNone ? [] : c.links);
  });

  it("draws the page's card in place of the link: picture, title, description and host, opening in a new tab", () => {
    const { container } = renderStory('Before.\n\n<https://www.example.com/rain>\n\nAfter.', [
      previewOf('https://www.example.com/rain', {
        title: 'A rainy walk',
        description: 'Notes from a walk after the rain.',
        siteName: 'Example',
        image: '/api/link-image?u=https%3A%2F%2Fcdn.example.com%2Fc.jpg&s=sig',
      }),
    ]);
    const card = screen.getByRole('link', { name: 'Open link: example.com' });
    expect(card).toHaveAttribute('href', 'https://www.example.com/rain');
    expect(card).toHaveAttribute('target', '_blank');
    expect(card.getAttribute('rel')!.split(' ').sort()).toEqual(['nofollow', 'noopener', 'noreferrer', 'ugc']);
    // Read out with its title, not only the host.
    expect(document.getElementById(card.getAttribute('aria-describedby')!)).toHaveTextContent('A rainy walk');
    expect(card).toHaveTextContent('Notes from a walk after the rain.');
    expect(card).toHaveTextContent('example.com');
    expect(card.querySelector('img')).toHaveAttribute('src', '/api/link-image?u=https%3A%2F%2Fcdn.example.com%2Fc.jpg&s=sig');
    // The card is its own block, never inside a paragraph; the prose around it stays prose.
    expect(card.closest('p')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('drops the picture, frame and all, when it fails to load', () => {
    renderStory('https://example.com/a', [previewOf('https://example.com/a', { image: '/api/link-image?u=x&s=y' })]);
    const card = screen.getByRole('link', { name: 'Open link: example.com' });
    fireEvent.error(card.querySelector('img')!);
    expect(card.querySelector('img')).toBeNull();
    expect(card).toHaveTextContent('Title of https://example.com/a');
  });

  it('draws the link as it always was when it has no preview', () => {
    renderStory('https://example.com/a\n\n[named](https://example.com/b)', [previewOf('https://example.com/other')]);
    expect(cardLinks()).toEqual([]);
    expect(screen.getByRole('link', { name: 'named' })).toHaveAttribute('href', 'https://example.com/b');
    expect(screen.getByRole('link', { name: 'https://example.com/a' }).closest('p')).not.toBeNull();
    // Without any previews at all, too (another page's StoryMarkdown).
    renderWithIntl(<StoryMarkdown source="https://example.com/c" />);
    expect(screen.getByRole('link', { name: 'https://example.com/c' })).toBeInTheDocument();
  });

  it('keeps a card link an embedded card, whatever previews the page has', () => {
    renderStory('[A card](/card/a-quiet-night)', [previewOf('https://example.com/a')]);
    expect(screen.getByTestId('card-embed')).toHaveTextContent('/card/a-quiet-night');
    expect(cardLinks()).toEqual([]);
  });

  it('takes the key of a bare www address as the server does (GFM would link it to http://)', () => {
    renderStory('www.example.org/notes', [previewOf('https://www.example.org/notes')]);
    expect(cardLinks()).toEqual(['https://www.example.org/notes']);
  });
});

describe('StoryMarkdown tables', () => {
  it('draws a table in a named box of its own that scrolls sideways, each cell wrapped', () => {
    const { container } = renderWithIntl(
      <StoryMarkdown source={'前言\n\n| 地點 | 次數 |\n|:--|--:|\n| 台北 | 3 |\n| 高雄 | 12 |'} script="cjk" lang="zh-TW" />,
    );
    const region = screen.getByRole('region', { name: 'Table' });
    expect(region).toHaveClass('story-table');
    expect(region).toHaveAttribute('tabindex', '0');
    const table = region.querySelector('table')!;
    expect(table.querySelectorAll('th')).toHaveLength(2);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelectorAll('.story-cell')).toHaveLength(6);
  });

  // Round 9 §6: every cell starts at the start edge, the header's too, whatever the colons say — the
  // alignment GFM writes on a cell is left in the source, and story.css sets `start` on the cells
  // themselves (on the table, the browser's own `th { text-align: center }` would win).
  it('starts every cell at the start edge, dropping the alignment the colons asked for', () => {
    renderWithIntl(<StoryMarkdown source={'| 地點 | 說明 | 次數 |\n|:--|:-:|--:|\n| 台北 | 雨 | 3 |'} />);
    const cells = [...screen.getByRole('region', { name: 'Table' }).querySelectorAll('th, td')];
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell.getAttribute('style')).toBeNull();
      expect(cell.getAttribute('align')).toBeNull();
    }
    const css = readFileSync(join(process.cwd(), 'src/styles/story.css'), 'utf8');
    const cellRule = css.match(/\.story-prose \.story-table :is\(th, td\) \{[^}]*\}/)?.[0] ?? '';
    expect(cellRule).toMatch(/text-align:\s*start/);
  });
});

describe('tableMore', () => {
  it('says which side of a table wider than its box has more to see', async () => {
    const { tableMore } = await import('./StoryTable');
    expect(tableMore(0, 300, 300)).toBeNull();
    expect(tableMore(0, 600, 300)).toBe('end');
    expect(tableMore(150, 600, 300)).toBe('both');
    expect(tableMore(300, 600, 300)).toBe('start');
  });
});

// The card page renders again and again while it loads (auth settling, its
// own read, the lists around the card, the byline measured); parsing the
// story each time was the page's costliest work in the browser.
describe('StoryMarkdown renders', () => {
  it('parses a story once, however often the page around it renders, and again only when it changes', () => {
    let rerenderPage: () => void = () => {};
    let setSource: (s: string) => void = () => {};
    function Page() {
      const [, setTick] = useState(0);
      const [source, set] = useState('# A heading\n\nOne paragraph.');
      rerenderPage = () => setTick((n) => n + 1);
      setSource = set;
      return <StoryMarkdown source={source} script="latin" lang="en" />;
    }
    markdown.parses = 0;
    renderWithIntl(<Page />);
    expect(markdown.parses).toBe(1);

    act(() => rerenderPage());
    act(() => rerenderPage());
    expect(markdown.parses).toBe(1);
    expect(screen.getByRole('heading', { name: 'A heading' })).toBeInTheDocument();

    act(() => setSource('Another story.'));
    expect(markdown.parses).toBe(2);
    expect(screen.getByText('Another story.')).toBeInTheDocument();
  });

  it('draws its link cards again when the page’s previews arrive', () => {
    const preview: LinkPreview = { url: 'https://example.com/a', title: 'Example page' };
    let setPreviews: (p: LinkPreview[] | null) => void = () => {};
    function Page() {
      const [previews, set] = useState<LinkPreview[] | null>(null);
      setPreviews = set;
      return (
        <StoryLinkPreviewsContext.Provider value={previews}>
          <StoryMarkdown source={'Before.\n\n<https://example.com/a>\n\nAfter.'} />
        </StoryLinkPreviewsContext.Provider>
      );
    }
    renderWithIntl(<Page />);
    expect(screen.queryByText('Example page')).toBeNull();
    act(() => setPreviews([preview]));
    expect(screen.getByText('Example page')).toBeInTheDocument();
  });
});
