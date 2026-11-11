/**
 * Static JSX to HTML on the server, for the islands (Island.tsx): a server component can't reach react-dom/server, and
 * an island's inside must be a string. Host elements and plain function components (no hooks, no context) only —
 * what the world's art is drawn with — spelled as React spells them (class, stop-color, clipPathUnits, style text).
 *
 * Where the art doesn't change, shorter: every `d` through `path` (script/compact.ts), and a <path> drawn twice
 * with every attribute the same is drawn once, given an id, and used again (<use>: the clone keeps its paint).
 */
import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/** SVG attributes React passes through in camelCase. */
const CAMEL = new Set([
  'viewBox',
  'preserveAspectRatio',
  'clipPathUnits',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'maskUnits',
  'maskContentUnits',
  'pathLength',
  'spreadMethod',
  'stdDeviation',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'refX',
  'refY',
  'startOffset',
  'textLength',
  'lengthAdjust',
  'primitiveUnits',
  'filterUnits',
  'baseFrequency',
  'numOctaves',
  'tableValues',
  'kernelMatrix',
  'diffuseConstant',
  'specularConstant',
  'specularExponent',
  'surfaceScale',
  'stitchTiles',
  'xChannelSelector',
  'yChannelSelector',
  'zoomAndPan',
]);
const RENAMED: Record<string, string> = { className: 'class', htmlFor: 'for', xlinkHref: 'xlink:href', xmlnsXlink: 'xmlns:xlink', xmlSpace: 'xml:space', tabIndex: 'tabindex' };
/** CSS properties a bare number is written into as is (React's own list, the ones the art could use). */
const UNITLESS = new Set(['opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'lineHeight', 'fontWeight', 'zoom', 'fillOpacity', 'strokeOpacity', 'stopOpacity', 'floodOpacity', 'strokeMiterlimit', 'strokeDashoffset', 'strokeWidth', 'aspectRatio', 'scale']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['style', 'script']);

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^(webkit|moz|ms)-/, '-$1-');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function attrName(k: string): string {
  if (RENAMED[k]) return RENAMED[k];
  if (k.startsWith('aria-') || k.startsWith('data-') || CAMEL.has(k) || !/[A-Z]/.test(k)) return k;
  return kebab(k);
}

function styleText(o: Record<string, unknown>): string {
  return Object.entries(o)
    .filter(([, v]) => v != null && v !== '' && typeof v !== 'boolean')
    .map(([k, v]) => {
      const name = k.startsWith('--') ? k : kebab(k);
      const val = typeof v === 'number' && v !== 0 && !k.startsWith('--') && !UNITLESS.has(k) ? `${v}px` : String(v);
      return `${name}:${val}`;
    })
    .join(';');
}

interface Opts {
  /** Rewrites every `d` (the path data). */
  path?: (d: string) => string;
}

type Hook = (attrs: string) => string | null;

function render(node: ReactNode, o: Opts, svg: boolean, onPath: Hook): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return escText(String(node));
  if (Array.isArray(node)) return node.map((n) => render(n, o, svg, onPath)).join('');
  if (!isValidElement(node)) return '';
  const el = node as ReactElement<Record<string, unknown>>;
  const props = el.props;
  if (el.type === Fragment) return render(props.children as ReactNode, o, svg, onPath);
  if (typeof el.type === 'function') return render((el.type as (p: unknown) => ReactNode)(props), o, svg, onPath);
  if (typeof el.type !== 'string') throw new Error('staticHtml: only host elements and plain function components');
  const tag = el.type;
  const inSvg = svg || tag === 'svg';
  let a = '';
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'dangerouslySetInnerHTML' || k === 'key' || k === 'ref' || k === 'suppressHydrationWarning' || v == null || v === false) continue;
    if (typeof v === 'function') continue;
    let val: string;
    if (k === 'style') val = styleText(v as Record<string, unknown>);
    else if (v === true) val = '';
    else val = String(v);
    if (k === 'd' && o.path) val = o.path(val);
    if (k === 'style' && !val) continue;
    a += ` ${attrName(k)}="${escAttr(val)}"`;
  }
  const html = (props.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html;
  const kids = html ?? (RAW.has(tag) ? String(props.children ?? '') : render(props.children as ReactNode, o, inSvg, onPath));
  if (tag === 'path' && !kids && !/ id="/.test(a)) {
    const swapped = onPath(a);
    if (swapped != null) return swapped;
  }
  if (!kids && (inSvg || VOID.has(tag))) return `<${tag}${a}${inSvg ? '/' : ''}>`;
  return `<${tag}${a}>${kids}</${tag}>`;
}

/** `node` as HTML (inside an <svg> when `svg`: elements without content close themselves). */
export function toHtml(node: ReactNode, o: Opts = {}, svg = false): string {
  // first: which childless paths are drawn more than once, attribute for attribute
  const seen = new Map<string, number>();
  render(node, o, svg, (a) => {
    seen.set(a, (seen.get(a) ?? 0) + 1);
    return null;
  });
  const ids = new Map<string, string>();
  let n = 0;
  return render(node, o, svg, (a) => {
    if ((seen.get(a) ?? 0) < 2) return null;
    const id = ids.get(a);
    if (id) return `<use href="#${id}"/>`;
    const fresh = `film-p${n++}`;
    ids.set(a, fresh);
    return `<path id="${fresh}"${a}/>`;
  });
}
