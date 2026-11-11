/**
 * The page's scrollbar on the landing page (the owner, 2026-11-12: first 「scroll bar 的底色…和當前畫面的底色最相近…到推薦
 * 故事的區段…變成我們主題的顏色」, then 「讓這個 scroll bar 是疊在畫面上」, fading when idle). The native bar steps aside
 * from the first paint (`NATIVE_BAR_OFF`), and the site's drawn bar (OrganicScrollbar `page`, `autoHide`) floats over
 * the picture at the window's edge — no column of its own, so the film runs to the edge and nothing need make room.
 * Over the film its ink is the chrome's (cream over a night, graphite over a day); once the stories' paper is up
 * (`data-paper`) the rule is emptied and it wears the theme's ink (globals.css `--sb-*`). Pure text: the server
 * writes frame 0's, the runtime each step of the light.
 */

/** The native bar hidden on this page (Chromium styles the page's bar on <body>, WebKit and Firefox on the root);
 *  forced colours keep the system's, as the drawn bar steps aside there. */
export const NATIVE_BAR_OFF =
  '@media not (forced-colors: active){' +
  ':root:has([data-film-page]),:root:has([data-film-page])>body{scrollbar-width:none}' +
  ':root:has([data-film-page])::-webkit-scrollbar,:root:has([data-film-page])>body::-webkit-scrollbar{width:0;height:0}}';

/** The drawn bar's ink in an hour's light (`paletteAt`): rest, the column pointed at, the thumb pointed at, the faint
 *  track; a drag keeps the theme's terracotta. */
export function scrollbarCss(vars: Record<string, string>, scope = ''): string {
  const ink = vars['--film-chrome-ink'];
  const mix = (k: number) => `color-mix(in oklch, ${ink} ${k}%, transparent)`;
  const at = scope ? `${scope} [data-page-scrollbar]` : '[data-page-scrollbar]';
  return `${at}{--sb-thumb:${mix(50)};--sb-thumb-near:${mix(65)};--sb-thumb-hover:${mix(80)};--sb-track-hover:${mix(14)}}`;
}
