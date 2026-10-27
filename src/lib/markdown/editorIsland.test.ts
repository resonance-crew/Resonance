// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The native apps' editor island (native/editor/src/island.ts), run here in
// jsdom: what a host asks of it in the query and over the bridge, and what it
// posts back. The apps' own suites (StoryEditorBridgeTests…) run the built
// page; this pins the island's side of the contract where the web's rules
// (lib/text/script, LatinMarks) are.

// jsdom lays nothing out: ProseMirror measures the caret with ranges it can't measure.
Range.prototype.getBoundingClientRect ??= () => new DOMRect(0, 40, 0, 24);
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Document.prototype.elementFromPoint ??= () => null;

let posted: Record<string, unknown>[] = [];
beforeEach(() => {
  posted = [];
  document.body.innerHTML = '<div id="editor"></div>';
  document.documentElement.className = '';
  window.ResonanceBridge = { postMessage: (json: string) => posted.push(JSON.parse(json)) };
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

/** Loads the island as a host opens it, with this query. */
async function open(query: string) {
  window.history.replaceState(null, '', `/editor.html?${query}`);
  await import('../../../native/editor/src/island');
  return window.ResonanceEditor;
}
const root = () => document.querySelector<HTMLElement>('.ProseMirror')!;
const last = (type: string) => posted.filter((m) => m.type === type).at(-1);

describe('the editor island', () => {
  it('lays the writer’s bare page out on ?layout=canvas, and the framed field without it', async () => {
    await open('embed=1&layout=canvas');
    expect(document.documentElement).toHaveClass('embed', 'canvas');
  });

  it('starts an empty story in the UI locale’s type, tells the host, and sets a story opened by what it says', async () => {
    const island = await open('layout=canvas&locale=en');
    expect(root()).toHaveClass('story-prose');
    expect(root()).toHaveAttribute('data-script', 'latin');
    expect(last('script')).toEqual({ type: 'script', script: 'latin', lang: null });

    island.setMarkdown('那天早上下著小雨，我站在操場邊，看著跑道上的水窪。');
    expect(root()).toHaveAttribute('data-script', 'cjk');
    expect(root()).toHaveAttribute('lang', 'zh-TW');
    expect(last('script')).toEqual({ type: 'script', script: 'cjk', lang: 'zh-TW' });
  });

  it('keeps installed hosts’ stories CJK: no locale, no type of its own', async () => {
    await open('embed=1');
    expect(root()).toHaveAttribute('data-script', 'cjk');
  });

  it('reads the title with the story, a moment after writing pauses', async () => {
    vi.useFakeTimers();
    const island = await open('locale=zh-TW');
    island.setMarkdown('');
    island.setTitle('The first morning I woke up alone and made myself a cup of coffee for the very first time');
    expect(root()).toHaveAttribute('data-script', 'cjk');
    await vi.advanceTimersByTimeAsync(1600);
    expect(root()).toHaveAttribute('data-script', 'latin');
    expect(root()).toHaveAttribute('lang', 'en');
  });

  it('takes a type set by hand, and goes back to reading it', async () => {
    const island = await open('locale=zh-TW');
    island.setScript('latin', 'en');
    expect(root()).toHaveAttribute('data-script', 'latin');
    island.setMarkdown('那天早上下著小雨，我站在操場邊。');
    expect(root()).toHaveAttribute('data-script', 'latin');
    island.setScript(null);
    expect(root()).toHaveAttribute('data-script', 'cjk');
  });

  it('marks an apostrophe inside a Latin word, without storing anything for it', async () => {
    const island = await open('locale=zh-TW');
    island.setMarkdown('教練只說：don’t rush.');
    expect(root().querySelector('.story-latin-mark')).toHaveTextContent('’');
    expect(island.getMarkdown()).toBe('教練只說：don’t rush.');
  });

  it('tells the host where the caret’s line is while the story has the focus', async () => {
    const island = await open('layout=canvas');
    island.setMarkdown('A line');
    island.focus();
    await vi.waitFor(() => expect(last('caret')).toEqual({ type: 'caret', top: 40, bottom: 64 }));
  });

  describe('links (round 16 §6)', () => {
    it('says which link the selection is in, and whether 卡片 is offered', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('看 [這篇](https://example.com/a) 吧');
      island.focus();
      await vi.waitFor(() => expect(last('state')).toMatchObject({ link: null, canCard: false }));
      island.setMarkdown('');
      island.focus();
      await vi.waitFor(() => expect(last('state')).toMatchObject({ link: null, canCard: true }));
    });

    it('turns an empty line into a link card, words it, and takes it away', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('');
      island.focus();
      expect(island.exec('link', { href: 'example.com/rain', display: 'card' })).toBe(true);
      expect(island.getMarkdown()).toBe('<https://example.com/rain>');
      // The card drawn: its host over its address, until a preview is handed over.
      const card = () => root().querySelector<HTMLElement>('.link-card')!;
      expect(card().querySelector('.link-card-title')).toHaveTextContent('example.com');
      expect(card().querySelector('.link-card-host')).toHaveTextContent('https://example.com/rain');
      island.setLinkPreviews([{ url: 'https://example.com/rain', title: '下雨天的散步', image: 'https://evil.example/x.png' }]);
      expect(card().querySelector('.link-card-title')).toHaveTextContent('下雨天的散步');
      expect(card().querySelector('img')).toBeNull();

      // A tap picks it and tells the host, which opens its sheet with 卡片 chosen.
      card().click();
      expect(last('linkTap')).toEqual({ type: 'linkTap', href: 'https://example.com/rain' });
      await vi.waitFor(() =>
        expect(last('state')).toMatchObject({ link: { href: 'https://example.com/rain', display: 'card', standalone: true }, canCard: true }),
      );
      expect(island.exec('link', { href: 'https://example.com/rain', display: 'text' })).toBe(true);
      expect(island.getMarkdown()).toBe('[example.com/rain](https://example.com/rain)');
      expect(island.exec('unlink')).toBe(true);
      expect(island.getMarkdown()).toBe('example.com/rain');
    });

    it('refuses what it doesn’t link to, and 卡片 inside a sentence', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('一句話');
      island.focus();
      expect(island.exec('link', { href: 'javascript:alert(1)', display: 'text' })).toBe(false);
      expect(island.exec('link', { href: 'https://example.com', display: 'card' })).toBe(false);
      expect(island.exec('link', { href: 'https://example.com' })).toBe(false);
      expect(island.getMarkdown()).toBe('一句話');
    });
  });
});
