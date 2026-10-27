import { normalizeLink } from './url';

/**
 * The parts of the story link rule that need no Markdown parser: whether a
 * link's words are its own address, which addresses may stand in a story as
 * a link card at all, and how the writer's link editor reads an address typed
 * or pasted and words it. Client-safe and light — the apps' editor island
 * bundles it beside the schema (src/lib/markdown/editorSchema), the server
 * and the reader through storyLinks.ts.
 */

/**
 * Our own hosts. A link to one of our pages is never unfurled — the server
 * would be asking itself, and a card already has its own embed (`/card/…`).
 */
export const SITE_HOSTS: readonly string[] = ['resonance.channel', 'www.resonance.channel', 'resonance-world.vercel.app'];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Whether a host name is an address written as numbers (IPv4, or an IPv6 literal in brackets). */
export function isIpHost(host: string): boolean {
  return IPV4.test(host) || host.startsWith('[');
}

/** An address with its scheme and one trailing slash set aside — how a link's words are matched to its href. */
const bareAddress = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/**
 * Whether a link's words are its own address — the writer's way of saying "show the page" rather than "read
 * my words": the words, trimmed, are one address the link rules take, naming the same page as the href.
 */
export function wordsAreTheAddress(words: string, href: string): boolean {
  const said = normalizeLink(words.trim());
  const target = normalizeLink(href);
  return !!said && !!target && bareAddress(said) === bareAddress(target);
}

/**
 * Whether an address may stand alone in a story as a link card (round 16
 * §6): one the link rules take (`normalizeLink`: http(s), no user name, a
 * host with a dot …), not one of our own pages (a card of ours is a
 * CardEmbed, `/card/…`) and not a bare IP address — those stay plain links,
 * as the server never previews them (`unfurlable`).
 */
export function cardableLink(href: string): boolean {
  const url = normalizeLink(href);
  if (!url) return false;
  const host = new URL(url).hostname.replace(/\.$/, '');
  return !SITE_HOSTS.includes(host) && !isIpHost(host);
}

/** What an address may not hold as the story keeps it (`<url>` on its own line, or a link's target). */
const UNSAFE_IN_ADDRESS = /[\s<>"`\\]/;

/**
 * The address the writer's link editor links to, from what was typed or
 * pasted into its field — or null when it isn't one we link to (the field
 * then says `linkInvalid`). http(s) only, as `normalizeLink` takes it; a bare
 * `www.…` or `example.com/x` gets `https://`; another scheme (`javascript:`,
 * `data:`, `mailto:` …) or a user name is refused. The address keeps the
 * writer's own spelling (a path in Chinese stays Chinese) unless it holds
 * something the story can't carry as written, when it is the normalized form.
 */
export function linkTarget(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  let written: string;
  if (/^https?:\/\//i.test(value)) written = value;
  // A scheme of its own (a colon before any slash, not a port's): never ours to link.
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return null;
  else if (value.startsWith('//')) written = `https:${value}`;
  else written = `https://${value}`;
  const normalized = normalizeLink(written);
  if (!normalized) return null;
  return UNSAFE_IN_ADDRESS.test(written) ? normalized : written;
}

/** At most this many characters of an address's words (`linkWords`), then 「…」. */
export const LINK_WORDS_MAX = 60;

/**
 * Words for a link shown as words (文字) when the writer selected none: its
 * host without `www.` and its path (`example.com/rain`), its query and
 * fragment left off, a trailing slash dropped, percent-escapes read as the
 * letters they stand for, cut to LINK_WORDS_MAX with 「…」. Never an address
 * the link rules take — no scheme, no `www.` — so it stays words, never a card.
 */
export function linkWords(href: string): string {
  let url: URL;
  try {
    url = new URL(normalizeLink(href) ?? href);
  } catch {
    return href.slice(0, LINK_WORDS_MAX);
  }
  let path = url.pathname.replace(/\/+$/, '');
  try {
    path = decodeURI(path);
  } catch {
    // An escape that doesn't decode stays as it is.
  }
  const words = `${url.hostname.replace(/^www\./i, '')}${path}`;
  const chars = Array.from(words);
  return chars.length > LINK_WORDS_MAX ? `${chars.slice(0, LINK_WORDS_MAX - 1).join('')}…` : words;
}
