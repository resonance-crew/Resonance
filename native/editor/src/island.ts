/**
 * The story editor as a WebView "island" for the native apps.
 *
 * Same schema and Markdown as the web editor (src/lib/markdown/editorSchema),
 * so a story round-trips identically on every platform; only the node views
 * differ — plain DOM here, drawing the organic curves with the web's own
 * geometry (wobRect, wavyVertical). Built into one self-contained file by
 * scripts/native/build-editor.mjs.
 *
 * Page (query): ?embed=1 the story field of the writing screen (framed by the
 *   host); ?layout=canvas the writer's bare page (no frame, no padding — the
 *   host sizes the view and scrolls it); ?locale= the UI's locale, whose type
 *   an empty story starts in (default zh-TW); ?script=cjk|latin sets the story
 *   in that type for good (the host decides); ?placeholder=, ?fonts=. A table's
 *   source is labelled in ?locale='s language (card.table: 表格 / Table).
 * Bridge (native → island): window.ResonanceEditor.{setMarkdown, getMarkdown, roundtrip, focus, blur, exec,
 *   setTitle, setScript, setLinkPreviews}
 *   exec(command, args?) runs a toolbar command (the web MarkdownEditor's set:
 *   bold, italic, h2, h3, bulletList, orderedList, blockquote, insertCard,
 *   insertImage, undo, redo, link, unlink); it returns false when the command can't run.
 *   exec('link', {href, display: 'card' | 'text'}) is the link sheet's 完成 on the selection, the caret's link or
 *   a picked link card (src/lib/markdown/storyLinkEdit applyStoryLink): false, changing nothing, for an address
 *   we don't link to (http(s) only; a bare `example.com/x` gets https://) or 'card' where no card can stand
 *   (`state.canCard` false); 'card' for our own pages or an IP address links it as words. exec('unlink') is
 *   移除連結: a picked card goes, a link's words stay.
 *   setLinkPreviews([{url, title, image?}]) hands over a live card's stored link previews: a link card whose
 *   address has one shows its title (and its picture, when `image` is an absolute https URL of our own
 *   /api/link-image route); the others show their host and address.
 *   setTitle(title) tells the island the card's title, which it reads with the
 *   story to set them (lib/text/script writerScript, as the web writer does);
 *   setScript(script | null, lang?) sets the type by hand (null: by the text again).
 * Bridge (island → native): {type: 'ready' | 'change' | 'height' | 'state' | 'focus' | 'script' | 'caret', ...}
 *   posted to
 *   iOS  window.webkit.messageHandlers.editor
 *   Android window.ResonanceBridge.postMessage(json)
 *   'script' {script, lang}: how the story is set now (the host sets its title field the same way);
 *   'caret' {top, bottom}: the caret's line in the page's px (zoom included), while the story has the
 *   focus — the host keeps it above its keyboard bar;
 *   'state' also says `link` — {href, display: 'card' | 'text', standalone, words} for the link the selection
 *   is in (a picked link card included), else null — and `canCard`: whether the link sheet offers 卡片 now
 *   (a link card picked, an empty line, a whole paragraph selected, the caret in a link that is one);
 *   'linkTap' {href}: a link card was tapped (it is picked now) — the host opens its link sheet with 卡片
 *   chosen. Hosts ignore a type they don't know.
 */
import { Editor } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import { wavyVertical } from '../../../src/lib/design/wavyPath';
import { storyPictureShape } from '../../../src/lib/design/storyPicture';
import { INK_STRONG } from '../../../src/lib/design/strokes';
import { seedFromString } from '../../../src/lib/design/prng';
import { storyLinkWaveVars, waveInk } from '../../../src/lib/design/storyLinkWave';
import { resolvedAccent, resolvedScheme } from '../../../src/lib/design/appearance';
import { wobRect } from '../../../src/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '../../../src/lib/design/wobAuto';
import { BlockImage, CardEmbed, getMarkdown, LinkCard, MarkdownTable, storyExtensions } from '../../../src/lib/markdown/editorSchema';
import { applyStoryLink, canCard, removeStoryLink, storyLinkState, type LinkDisplay, type StoryLinkState } from '../../../src/lib/markdown/storyLinkEdit';
import { LatinMarks } from '../../../src/lib/markdown/latinMarks';
import { localeScript, storyLang, writerScript, type StoryScript } from '../../../src/lib/text/script';
// Only `card` of each is bundled (esbuild keeps a JSON file's top-level keys that are imported).
import { card as cardEn } from '../../../src/messages/en.json';
import { card as cardZhTW } from '../../../src/messages/zh-TW.json';

/** Which toolbar buttons show as on, and whether undo/redo can run — the web toolbar's activeStates. */
type ToolbarState = {
  active: Record<'bold' | 'italic' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote', boolean>;
  canUndo: boolean;
  canRedo: boolean;
  /** The link the selection is in (a picked link card included), or null. */
  link: StoryLinkState | null;
  /** Whether the link sheet offers 卡片 for the selection now. */
  canCard: boolean;
};
type Command =
  | 'bold'
  | 'italic'
  | 'h2'
  | 'h3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'insertCard'
  | 'insertImage'
  | 'undo'
  | 'redo'
  | 'link'
  | 'unlink';
/** A live card's stored preview of one of its links, as the host hands it over. */
type HostLinkPreview = { url: string; title: string; image?: string };
type Message =
  | { type: 'ready'; ms: number }
  | { type: 'change'; markdown: string }
  | { type: 'height'; px: number }
  | ({ type: 'state' } & ToolbarState)
  | { type: 'focus'; focused: boolean }
  | { type: 'script'; script: StoryScript; lang: string | null }
  | { type: 'caret'; top: number; bottom: number }
  | { type: 'linkTap'; href: string };

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: { postMessage(m: unknown): void } } };
    ResonanceBridge?: { postMessage(json: string): void };
    ResonanceEditor: {
      setMarkdown(md: string): string;
      getMarkdown(): string;
      roundtrip(md: string): string;
      focus(): void;
      blur(): void;
      exec(command: Command, args?: { href?: string; title?: string; src?: string; alt?: string; display?: LinkDisplay }): boolean;
      setTitle(title: string): void;
      setScript(script: StoryScript | null, lang?: string | null): void;
      setLinkPreviews(previews: HostLinkPreview[]): void;
    };
  }
}

function send(m: Message) {
  window.webkit?.messageHandlers?.editor?.postMessage(m);
  window.ResonanceBridge?.postMessage(JSON.stringify(m));
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The article's hand-drawn vertical curve beside the quote. The rail is
 * stretched to the quote's height by the flex layout and the SVG fills it
 * (preserveAspectRatio none, non-scaling stroke), so nothing has to measure
 * the DOM — ProseMirror owns it and re-creates node views freely.
 */
const IslandBlockquote = Blockquote.extend({
  addNodeView() {
    return () => {
      const dom = document.createElement('blockquote');
      dom.className = 'quote';
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'quote-curve');
      svg.setAttribute('viewBox', '-4 0 8 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', wavyVertical(100, 5, 1.6, 3));
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
      // The rail is stretched by the flex row; the SVG fills the rail.
      const rail = document.createElement('span');
      rail.className = 'quote-rail';
      rail.contentEditable = 'false';
      rail.append(svg);
      const contentDOM = document.createElement('div');
      contentDOM.className = 'quote-body';
      dom.append(rail, contentDOM);
      return { dom, contentDOM };
    };
  },
});

let pictureRings = 0;

/**
 * Photos clipped to the wobbly outline the article and the web writer use
 * (storyPictureShape), zoomed by its bleed so the outward swings land on the
 * photo. A picked one is ringed along that same outline — never a rectangle —
 * the pen pressed harder (INK_STRONG) in terracotta, drawn inside its edge (a
 * stroke twice as wide, clipped to the shape) so the writer's bare page, whose
 * edge is the text's, never cuts it off.
 */
const IslandImage = BlockImage.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'image story-picture';
      const box = document.createElement('span');
      box.className = 'picture-box';
      const clipBox = document.createElement('span');
      clipBox.className = 'picture-clip';
      const img = document.createElement('img');
      img.src = String(node.attrs.src ?? '');
      img.alt = String(node.attrs.alt ?? '');
      const ring = document.createElementNS(SVG, 'svg');
      ring.setAttribute('class', 'picture-ring');
      ring.setAttribute('aria-hidden', 'true');
      const clipId = `picture-ring-${++pictureRings}`;
      const clipPath = document.createElementNS(SVG, 'clipPath');
      clipPath.id = clipId;
      const inside = document.createElementNS(SVG, 'path');
      clipPath.append(inside);
      const line = document.createElementNS(SVG, 'path');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'var(--color-terracotta)');
      line.setAttribute('stroke-width', String(INK_STRONG * 2));
      line.setAttribute('clip-path', `url(#${clipId})`);
      ring.append(clipPath, line);
      let size = '';
      const shape = () => {
        const w = img.clientWidth;
        const h = img.clientHeight;
        if (!w || !h || `${w}x${h}` === size) return;
        size = `${w}x${h}`;
        const { clip, bleed } = storyPictureShape(w, h, seedFromString(img.src));
        clipBox.style.clipPath = `path("${clip}")`;
        img.style.transform = `scale(${(w + bleed * 2) / w}, ${(h + bleed * 2) / h})`;
        ring.setAttribute('viewBox', `0 0 ${w} ${h}`);
        inside.setAttribute('d', clip);
        line.setAttribute('d', clip);
      };
      img.addEventListener('load', shape);
      img.addEventListener('error', () => dom.classList.add('broken'));
      const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(shape);
      resized?.observe(img);
      clipBox.append(img);
      box.append(clipBox, ring);
      dom.append(box);
      return {
        dom,
        selectNode: () => dom.classList.add('picked'),
        deselectNode: () => dom.classList.remove('picked'),
        destroy: () => resized?.disconnect(),
      };
    };
  },
});

/** A card link as a small card; the host could fill in author and image. */
const IslandCardEmbed = CardEmbed.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'card-embed story-embed';
      dom.contentEditable = 'false';
      const title = document.createElement('span');
      title.textContent = String(node.attrs.title ?? '');
      const href = document.createElement('small');
      href.textContent = String(node.attrs.href ?? '');
      dom.append(title, href);
      return { dom };
    };
  },
});

// ── Link cards ──
/** The live card's previews by address (setLinkPreviews), and every link card drawn now, to draw again when they change. */
const linkPreviews = new Map<string, HostLinkPreview>();
const linkCardViews = new Set<() => void>();
/** The only pictures a link card shows: our own link-image route's, made absolute by the host. */
const ownLinkImage = (image: string | undefined) => {
  if (!image) return null;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && url.pathname === '/api/link-image' ? url.href : null;
  } catch {
    return null;
  }
};
/** An address's host for the card's foot, without `www.`. */
const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
};
/** The preview stored for an address, matched as the server keyed it (normalized, a trailing slash aside). */
const previewFor = (href: string) => {
  const bare = (u: string) => u.replace(/\/$/, '');
  for (const [url, preview] of linkPreviews) if (bare(url) === bare(href)) return preview;
  try {
    return linkPreviews.get(new URL(href).href) ?? null;
  } catch {
    return null;
  }
};

/**
 * A link standing alone as its page's card (the schema's LinkCard): the
 * reader's link-card frame, quiet — a light fill cut to a wobbly outline, no
 * pen line — holding the stored preview's title (and picture) when the host
 * handed one over, else the address's host over the address. A tap picks it
 * and tells the host, which opens its link sheet with 卡片 chosen.
 */
const IslandLinkCard = LinkCard.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'link-card story-embed';
      dom.contentEditable = 'false';
      const picture = document.createElement('img');
      picture.className = 'link-card-picture';
      picture.alt = '';
      picture.referrerPolicy = 'no-referrer';
      picture.addEventListener('error', () => picture.remove());
      const title = document.createElement('span');
      title.className = 'link-card-title';
      const foot = document.createElement('small');
      foot.className = 'link-card-host';
      let href = String(node.attrs.href ?? '');
      const draw = () => {
        const preview = previewFor(href);
        const image = ownLinkImage(preview?.image);
        if (image) {
          if (picture.src !== image) picture.src = image;
          if (!picture.isConnected) dom.prepend(picture);
        } else picture.remove();
        title.textContent = preview?.title ?? hostOf(href);
        foot.textContent = preview ? hostOf(href) : href;
      };
      draw();
      dom.append(title, foot);
      // Its outline, measured: the reader's link card's wobble (R 16, the size's own).
      let size = '';
      const shape = () => {
        const w = dom.clientWidth;
        const h = dom.clientHeight;
        if (!w || !h || `${w}x${h}` === size) return;
        size = `${w}x${h}`;
        const d = wobRect(w, h, 16, seedFromString(href), autoMag(w, h), { segmentsH: autoSegments(w), segmentsV: autoSegments(h), curve: autoCurve(w, h) });
        dom.style.clipPath = `path("${d}")`;
        dom.style.borderRadius = '0';
      };
      const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(shape);
      resized?.observe(dom);
      linkCardViews.add(draw);
      dom.addEventListener('click', (e) => {
        e.preventDefault();
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos != null) editor.chain().focus().setNodeSelection(pos).run();
        send({ type: 'linkTap', href });
      });
      return {
        dom,
        update: (next) => {
          if (next.type.name !== 'linkCard') return false;
          if (String(next.attrs.href ?? '') !== href) {
            href = String(next.attrs.href ?? '');
            size = '';
            draw();
            shape();
          }
          return true;
        },
        selectNode: () => dom.classList.add('picked'),
        deselectNode: () => dom.classList.remove('picked'),
        ignoreMutation: () => true,
        destroy: () => {
          resized?.disconnect();
          linkCardViews.delete(draw);
        },
      };
    };
  },
});

const params = new URLSearchParams(location.search);
// ?embed=1: the story field of the writing screen — the host frames it, sizes
// the view to the content (the 'height' message) and scrolls the page itself.
if (params.get('embed') === '1') document.documentElement.classList.add('embed');
// ?layout=canvas: the writer's bare page — no frame and no padding of its own (island.css).
if (params.get('layout') === 'canvas') document.documentElement.classList.add('canvas');
// The pen wave every link in the story wears (island.css), as the web editor's, in the ink of the
// theme and scheme the host puts on <html> (data-accent, data-scheme) — again whenever it changes them.
const wearWave = () => {
  const ink = waveInk(resolvedAccent(), resolvedScheme());
  for (const [name, value] of Object.entries(storyLinkWaveVars('editor', ink))) document.documentElement.style.setProperty(name, value);
};
wearWave();
new MutationObserver(wearWave).observe(document.documentElement, { attributes: true, attributeFilter: ['data-accent', 'data-scheme'] });
// A table's source wears 表格 / Table (the web writer's card.table), in the UI's language: ?locale=, which
// the writer's page passes (the island's zh-TW without it, as its placeholder and type).
const tableLabel = (params.get('locale') ?? 'zh-TW').startsWith('en') ? cardEn.table : cardZhTW.table;
const extensions = [
  ...storyExtensions({
    blockquote: IslandBlockquote,
    image: IslandImage,
    cardEmbed: IslandCardEmbed,
    linkCard: IslandLinkCard,
    markdownTable: MarkdownTable.configure({ label: tableLabel }),
  }),
  // The apostrophes inside Latin words, set in the Latin face (a decoration: the stored story is untouched).
  LatinMarks,
  Placeholder.configure({ placeholder: params.get('placeholder') ?? '寫下你的故事…' }),
];

// ── How the story is set (src/styles/story.css on .story-prose) ──
// Its script and language, read off the title and the story as the web writer
// reads them (writerScript: an empty story in the UI locale's type, changing
// only once it clearly leans the other way), again a moment after writing
// pauses — never per keystroke. Installed hosts pass neither ?locale nor a
// title: their stories start as CJK, as the island always set them.
const forcedParam = params.get('script');
let forced: StoryScript | null = forcedParam === 'cjk' || forcedParam === 'latin' ? forcedParam : null;
let forcedLang: string | null = null;
const startScript: StoryScript = localeScript(params.get('locale') ?? 'zh-TW');
let title = '';
let type: { script: StoryScript; lang: string | null } = { script: forced ?? startScript, lang: null };
let typeTimer: ReturnType<typeof setTimeout> | undefined;
/** How long writing must pause before the story's type is read again (the web writer's autosave tick). */
const TYPE_DELAY_MS = 1500;

function rootAttributes(): Record<string, string> {
  return { class: 'story-prose', 'data-script': type.script, ...(type.lang ? { lang: type.lang } : {}) };
}

let timer: ReturnType<typeof setTimeout> | undefined;
const editor = new Editor({
  element: document.getElementById('editor')!,
  extensions,
  content: '',
  // A story's type is the web's src/styles/story.css, keyed on this class (island.css).
  editorProps: { attributes: rootAttributes() },
  onUpdate: () => {
    clearTimeout(timer);
    timer = setTimeout(() => send({ type: 'change', markdown: getMarkdown(editor) }), 150);
    readTypeSoon();
  },
  onTransaction: () => sendState(),
  onSelectionUpdate: () => sendCaret(),
  onFocus: () => {
    send({ type: 'focus', focused: true });
    sendCaret();
  },
  onBlur: () => send({ type: 'focus', focused: false }),
});

/** Sets the story's type on its root, and tells the host. */
function setType(next: { script: StoryScript; lang: string | null }) {
  if (next.script === type.script && next.lang === type.lang) return;
  type = next;
  editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: rootAttributes() } });
  send({ type: 'script', script: type.script, lang: type.lang });
}

/** The type the text calls for: from `from` (writerScript's hysteresis), or as set by hand. */
function readType(from: StoryScript): { script: StoryScript; lang: string | null } {
  const story = editor.isEmpty ? '' : getMarkdown(editor);
  if (forced) return { script: forced, lang: forcedLang ?? storyLang(title, story) ?? null };
  return { script: writerScript(from, title, story), lang: storyLang(title, story) ?? null };
}

function readTypeSoon() {
  clearTimeout(typeTimer);
  typeTimer = setTimeout(() => setType(readType(type.script)), TYPE_DELAY_MS);
}

// The caret's line while the story has the focus, at most once a frame: the host keeps it above its
// keyboard bar, scrolling only when it leaves the band it can see.
let caretFrame = 0;
function sendCaret() {
  cancelAnimationFrame(caretFrame);
  caretFrame = requestAnimationFrame(() => {
    if (!editor.isFocused) return;
    const rect = editor.view.coordsAtPos(editor.state.selection.head);
    // In the page's px as laid out, zoom included (the 'height' message's): where the host's text scale is a
    // CSS zoom on the body, an engine that measures inside it unzoomed (offsetHeight agrees with the rect)
    // is scaled here; one that measures it as drawn already is not.
    const zoom = parseFloat(document.body.style.zoom || '1') || 1;
    const drawn = document.body.getBoundingClientRect().height;
    const laidOut = document.body.offsetHeight;
    const scale = zoom !== 1 && Math.abs(drawn - laidOut) < Math.abs(drawn - laidOut * zoom) ? zoom : 1;
    send({
      type: 'caret',
      top: Math.round((rect.top + window.scrollY) * scale),
      bottom: Math.round((rect.bottom + window.scrollY) * scale),
    });
  });
}

// The host draws the toolbar (in its story field, or docked on its keyboard in
// the canvas layout); it only needs to hear when something it shows changed,
// at most once a frame.
let lastState = '';
let stateFrame = 0;
function sendState() {
  cancelAnimationFrame(stateFrame);
  stateFrame = requestAnimationFrame(() => {
    const state: ToolbarState = {
      active: {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        h2: editor.isActive('heading', { level: 2 }),
        h3: editor.isActive('heading', { level: 3 }),
        bulletList: editor.isActive('bulletList'),
        orderedList: editor.isActive('orderedList'),
        blockquote: editor.isActive('blockquote'),
      },
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      link: storyLinkState(editor.state),
      canCard: canCard(editor.state),
    };
    const json = JSON.stringify(state);
    if (json === lastState) return;
    lastState = json;
    send({ type: 'state', ...state });
  });
}

new ResizeObserver(() => {
  send({ type: 'height', px: document.documentElement.scrollHeight });
  // Its lines moved (a picture landed, the text re-wrapped): where the caret is now.
  if (editor.isFocused) sendCaret();
}).observe(document.body);

window.ResonanceEditor = {
  // Loading a draft is not an edit: kept out of undo history, so undo can
  // never take the page back to empty.
  setMarkdown(md) {
    editor.chain().setMeta('addToHistory', false).setContent(md, { emitUpdate: false }).run();
    // A story opened is read as it is (from the UI locale's type), not from whatever was set before.
    clearTimeout(typeTimer);
    setType(readType(startScript));
    return getMarkdown(editor);
  },
  getMarkdown: () => getMarkdown(editor),
  /** Parse and re-serialize without touching the visible document (corpus checks). */
  roundtrip(md) {
    const scratch = new Editor({ extensions: storyExtensions(), content: md });
    const out = getMarkdown(scratch);
    scratch.destroy();
    return out;
  },
  focus: () => editor.commands.focus('end'),
  blur: () => editor.commands.blur(),
  exec(command, args = {}) {
    const chain = editor.chain().focus();
    switch (command) {
      case 'bold': return chain.toggleBold().run();
      case 'italic': return chain.toggleItalic().run();
      case 'h2': return chain.toggleHeading({ level: 2 }).run();
      case 'h3': return chain.toggleHeading({ level: 3 }).run();
      case 'bulletList': return chain.toggleBulletList().run();
      case 'orderedList': return chain.toggleOrderedList().run();
      case 'blockquote': return chain.toggleBlockquote().run();
      // A card link becomes an embedded card, as when the web inserts one (InsertCardModal).
      case 'insertCard':
        if (!args.href?.startsWith('/card/')) return false;
        return chain.insertContent({ type: 'cardEmbed', attrs: { href: args.href, title: args.title ?? '' } }).run();
      // The host uploads the photo (/api/upload) and hands over its public URL.
      case 'insertImage':
        if (!args.src) return false;
        return chain.insertContent({ type: 'image', attrs: { src: args.src, alt: args.alt ?? '' } }).run();
      case 'undo': return chain.undo().run();
      case 'redo': return chain.redo().run();
      // The link sheet's 完成 and 移除連結, on the selection the story kept while the sheet was up.
      case 'link':
        if (!args.href || (args.display !== 'card' && args.display !== 'text')) return false;
        editor.commands.focus();
        return applyStoryLink(editor, args.href, args.display);
      case 'unlink':
        editor.commands.focus();
        return removeStoryLink(editor);
      default: return false;
    }
  },
  setTitle(next) {
    if (next === title) return;
    title = next;
    readTypeSoon();
  },
  setScript(script, lang = null) {
    forced = script;
    forcedLang = script ? lang : null;
    clearTimeout(typeTimer);
    setType(readType(script ?? startScript));
  },
  setLinkPreviews(previews) {
    linkPreviews.clear();
    for (const p of Array.isArray(previews) ? previews : []) {
      if (p && typeof p.url === 'string' && typeof p.title === 'string' && /^https?:\/\//i.test(p.url) && p.title) linkPreviews.set(p.url, p);
    }
    for (const draw of linkCardViews) draw();
  },
};


send({ type: 'ready', ms: performance.now() });
// The host learns how the story is set from the start.
send({ type: 'script', script: type.script, lang: type.lang });
