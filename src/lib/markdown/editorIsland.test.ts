// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every serialization the island makes, counted (it calls through to the real one).
const serialized = vi.hoisted(() => ({ count: 0 }));
vi.mock('./editorSchema', async (actual) => {
  const real = await actual<typeof import('./editorSchema')>();
  return {
    ...real,
    getMarkdown: (editor: Parameters<typeof real.getMarkdown>[0]) => {
      serialized.count++;
      return real.getMarkdown(editor);
    },
  };
});

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
  // Each test's island stays on the window (its listeners): whatever it hadn't told yet is told now, before
  // the next test's messages are counted.
  window.dispatchEvent(new Event('pagehide'));
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

  describe('what it tells the host of the story (audit X2)', () => {
    it('serializes an opened story once, and answers again from the same document without serializing', async () => {
      const island = await open('layout=canvas');
      serialized.count = 0;
      expect(island.setMarkdown('那天早上下著小雨，**我**站在操場邊。')).toBe('那天早上下著小雨，**我**站在操場邊。');
      expect(serialized.count).toBe(1);
      expect(island.getMarkdown()).toBe('那天早上下著小雨，**我**站在操場邊。');
      expect(island.getMarkdown()).toBe('那天早上下著小雨，**我**站在操場邊。');
      expect(serialized.count).toBe(1);
      // An edit is a new document: serialized again, once.
      island.exec('insertCard', { href: '/card/x', title: 'X' });
      island.getMarkdown();
      island.getMarkdown();
      expect(serialized.count).toBe(2);
    });

    it('waits out a pause of 150 ms before telling the host, once for a burst of edits', async () => {
      vi.useFakeTimers();
      const island = await open('layout=canvas');
      island.setMarkdown('一');
      island.focus();
      const changes = () => posted.filter((m) => m.type === 'change');
      for (const word of ['二', '三', '四']) {
        island.exec('insertCard', { href: '/card/x', title: word });
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(changes()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(150);
      expect(changes()).toHaveLength(1);
      expect(changes()[0].markdown).toBe(island.getMarkdown());
      // Nothing more to tell: no second message.
      await vi.advanceTimersByTimeAsync(2000);
      expect(changes()).toHaveLength(1);
    });

    it('tells at once on blur, on a hidden page and when the page goes away', async () => {
      vi.useFakeTimers();
      const island = await open('layout=canvas');
      island.setMarkdown('');
      const changes = () => posted.filter((m) => m.type === 'change');
      island.focus();
      await vi.advanceTimersByTimeAsync(20);
      island.exec('insertCard', { href: '/card/a', title: 'A' });
      // Tiptap blurs on the next frame: well inside the pause.
      island.blur();
      await vi.advanceTimersByTimeAsync(20);
      expect(changes()).toHaveLength(1);

      island.exec('insertCard', { href: '/card/b', title: 'B' });
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      expect(changes()).toHaveLength(2);

      island.exec('insertCard', { href: '/card/c', title: 'C' });
      window.dispatchEvent(new Event('pagehide'));
      expect(changes()).toHaveLength(3);
      expect(changes()[2].markdown).toBe(island.getMarkdown());
      // Told already: the pause ends in silence.
      await vi.advanceTimersByTimeAsync(1000);
      expect(changes()).toHaveLength(3);
    });

    it('never tells the host a story it put in itself', async () => {
      vi.useFakeTimers();
      const island = await open('layout=canvas');
      island.focus();
      island.exec('insertCard', { href: '/card/a', title: 'A' });
      island.setMarkdown('另一張卡');
      await vi.advanceTimersByTimeAsync(1000);
      expect(posted.filter((m) => m.type === 'change')).toHaveLength(0);
    });
  });

  describe('opening a card in one call (audit X5)', () => {
    it('sets the title, the previews and the story, reads the type once and tells it in one message', async () => {
      const island = await open('layout=canvas&locale=zh-TW');
      posted = [];
      serialized.count = 0;
      expect(
        island.open({
          title: 'The first morning I woke up alone',
          markdown: 'I made myself a cup of coffee for the very first time, and watched the rain.\n\n<https://example.com/rain>',
          previews: [{ url: 'https://example.com/rain', title: '下雨天的散步' }],
        }),
      ).toBe(true);
      expect(posted.filter((m) => m.type === 'script')).toEqual([{ type: 'script', script: 'latin', lang: 'en' }]);
      expect(posted.filter((m) => m.type === 'change')).toEqual([]);
      expect(serialized.count).toBe(1);
      expect(root()).toHaveAttribute('data-script', 'latin');
      expect(root().querySelector('.link-card-title')).toHaveTextContent('下雨天的散步');
      // Opened is not an edit: nothing to undo.
      expect(island.exec('undo')).toBe(false);
      expect(island.getMarkdown()).toBe('I made myself a cup of coffee for the very first time, and watched the rain.\n\n<https://example.com/rain>');
      expect(serialized.count).toBe(1);
    });

    it('tells the type even when it stays as it was', async () => {
      const island = await open('layout=canvas&locale=zh-TW');
      posted = [];
      island.open({ markdown: '那天早上下著小雨。' });
      island.open(null as never);
      expect(posted.filter((m) => m.type === 'script')).toHaveLength(2);
    });
  });

  describe('reset, for an island reused for another card (audit X1)', () => {
    it('empties the story, its undo history, its title and previews, and tells no change', async () => {
      vi.useFakeTimers();
      const island = await open('layout=canvas&locale=zh-TW');
      island.open({ title: 'The first morning', markdown: 'An English story, written for the very first time today.' });
      island.focus();
      await vi.advanceTimersByTimeAsync(20);
      island.exec('insertCard', { href: '/card/a', title: 'A' });
      island.setLinkPreviews([{ url: 'https://example.com/rain', title: '下雨天的散步' }]);
      island.reset();
      await vi.advanceTimersByTimeAsync(2000);
      expect(island.getMarkdown()).toBe('');
      expect(island.exec('undo')).toBe(false);
      expect(island.getMarkdown()).toBe('');
      expect(posted.filter((m) => m.type === 'change')).toEqual([]);
      expect(root()).toHaveAttribute('data-script', 'cjk');
      expect(last('state')).toMatchObject({ canUndo: false });
      // No preview of the last card's left behind, and it still writes.
      island.exec('link', { href: 'https://example.com/rain', display: 'card' });
      expect(root().querySelector('.link-card-title')).toHaveTextContent('example.com');
      expect(island.getMarkdown()).toBe('<https://example.com/rain>');
    });
  });

  describe('pictures from the clipboard or a drop (audit X6)', () => {
    /** A clipboard (or a drop) as WebKit hands one over: these files, these strings. */
    const transfer = (files: File[], strings: Record<string, string> = {}) =>
      ({ files, items: [], types: Object.keys(strings), getData: (t: string) => strings[t] ?? '', dropEffect: 'copy' }) as unknown as DataTransfer;
    const png = () => new File(['x'], 'photo.png', { type: 'image/png' });
    function paste(data: DataTransfer) {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      root().dispatchEvent(event);
      return event;
    }
    const pictures = () => root().querySelectorAll('img').length;

    it('hands a pasted picture to the host, putting nothing in itself', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('一句話');
      island.focus();
      const event = paste(transfer([png()], { 'text/html': '<img src="blob:resonance-editor://x/1">' }));
      expect(event.defaultPrevented).toBe(true);
      expect(last('pasteImage')).toEqual({ type: 'pasteImage' });
      expect(pictures()).toBe(0);
      expect(island.getMarkdown()).toBe('一句話');
    });

    it('keeps the words of a paste that has some, never its page-only pictures', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('');
      island.focus();
      paste(transfer([png()], { 'text/html': '<p>雨後的操場</p><img src="blob:resonance-editor://x/2"><img src="data:image/png;base64,AAAA">', 'text/plain': '雨後的操場' }));
      expect(last('pasteImage')).toBeUndefined();
      expect(island.getMarkdown()).toBe('雨後的操場');
      expect(island.getMarkdown()).not.toMatch(/blob:|data:/);
      // Markdown pasted as text, a page-only picture in it: gone too.
      paste(transfer([], { 'text/plain': '## 標題\n\n![](blob:resonance-editor://x/3)' }));
      expect(island.getMarkdown()).not.toMatch(/blob:/);
      expect(pictures()).toBe(0);
    });

    it('leaves a dropped picture file out, and never inserts a page-only address', async () => {
      const island = await open('layout=canvas');
      island.setMarkdown('一句話');
      island.focus();
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperties(drop, { dataTransfer: { value: transfer([png()]) }, clientX: { value: 0 }, clientY: { value: 0 } });
      root().dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      expect(island.exec('insertImage', { src: 'blob:resonance-editor://x/4' })).toBe(false);
      expect(island.exec('insertImage', { src: 'data:image/png;base64,AAAA' })).toBe(false);
      expect(island.getMarkdown()).toBe('一句話');
      // The host's uploaded picture still goes in.
      expect(island.exec('insertImage', { src: 'https://cdn.resonance.channel/p.webp' })).toBe(true);
      expect(island.getMarkdown()).toContain('![](https://cdn.resonance.channel/p.webp)');
    });
  });

  describe('its height (audit X3)', () => {
    it('tells the page’s height with how much is written, only when either changed', async () => {
      // The body's observer, held so the test can say when the body resized.
      let resized: (() => void) | undefined;
      const Stub = window.ResizeObserver;
      window.ResizeObserver = class {
        constructor(private cb: () => void) {}
        observe(target: Element) {
          if (target === document.body) resized = this.cb;
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      try {
        let page = 600;
        Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => page });
        const island = await open('layout=canvas');
        island.setMarkdown('第一段\n\n第二段');
        let foot = 120.2;
        const lastBlock = () => root().lastElementChild as HTMLElement;
        lastBlock().getBoundingClientRect = () => new DOMRect(0, foot - 24, 300, 24);
        const heights = () => posted.filter((m) => m.type === 'height');

        resized!();
        expect(heights()).toEqual([{ type: 'height', px: 600, content: 121 }]);
        resized!();
        expect(heights()).toHaveLength(1);
        // The page as tall as its view, the story longer: only `content` moved, and it is told.
        foot = 180;
        resized!();
        expect(heights().at(-1)).toEqual({ type: 'height', px: 600, content: 180 });
        page = 640;
        resized!();
        resized!();
        expect(heights()).toHaveLength(3);
        expect(heights().at(-1)).toEqual({ type: 'height', px: 640, content: 180 });
      } finally {
        window.ResizeObserver = Stub;
        delete (document.documentElement as unknown as { scrollHeight?: number }).scrollHeight;
      }
    });
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
