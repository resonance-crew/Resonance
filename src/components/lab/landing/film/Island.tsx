'use client';

/**
 * Static HTML the server drew, kept out of the RSC payload (SPEC §10: the world's symbols travel once). A server
 * component would be serialized into the payload whole, every path a second time; an island is an element whose
 * inside React never sees: on the server it is filled from what the server's own module registered (`islandHtml`,
 * World.tsx), in the browser React renders it empty and leaves the server's HTML in place (it skips the inside of an
 * element with `dangerouslySetInnerHTML`, and `suppressHydrationWarning` lets the two differ). So the payload carries
 * only its id.
 *
 * A page the router drew (a client-side navigation: no server HTML) finds its islands empty; each fills itself from
 * the page's own HTML, fetched once and shared — the island's paper arrives a moment late, nothing breaks (the stage's
 * <use>s resolve when their symbols come).
 */
import { createElement, useEffect, useRef } from 'react';
import { islandRegistry } from './islands';

let page: Promise<Document | null> | null = null;
/** This page's own server HTML, parsed (one request, whoever asks first). */
function pageDoc(): Promise<Document | null> {
  page ??= fetch(window.location.href.split('#')[0], { credentials: 'same-origin', headers: { accept: 'text/html' } })
    .then((r) => (r.ok ? r.text() : ''))
    .then((t) => (t ? new DOMParser().parseFromString(t, 'text/html') : null))
    .catch(() => null);
  return page;
}

type IslandProps = { id: string; as?: 'div' | 'svg' } & Record<string, string | number | boolean | undefined>;

export function Island({ id, as = 'div', ...rest }: IslandProps) {
  const ref = useRef<Element>(null);
  // the server's HTML on the server; in the browser nothing (React keeps what the server drew)
  const html = typeof window === 'undefined' ? (islandRegistry()[id] ?? '') : '';

  useEffect(() => {
    const el = ref.current;
    if (!el || el.firstChild || typeof fetch !== 'function' || typeof DOMParser === 'undefined') return;
    let live = true;
    void pageDoc().then((doc) => {
      const src = doc?.querySelector(`[data-island="${CSS.escape(id)}"]`);
      if (live && src && !el.firstChild) el.innerHTML = src.innerHTML;
    });
    return () => {
      live = false;
    };
  }, [id]);

  return createElement(as, { ...rest, ref, 'data-island': id, suppressHydrationWarning: true, dangerouslySetInnerHTML: { __html: html } });
}
