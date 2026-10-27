/**
 * The `link` glyph's two pens (24 box, round caps and joins), apart from its
 * React component so the apps' editor island — plain DOM, no React — draws
 * the very same mark on its link cards (native/editor/src/island.ts).
 */
export const LINK_PATHS = [
  // the upper link
  'M10.6,13.4 C9.4,12.0 9.6,10.0 10.9,8.7 C11.8,7.8 12.7,6.9 13.6,6.0 C15.0,4.6 17.3,4.7 18.6,6.0 C20.0,7.4 19.9,9.6 18.5,11.0 C18.0,11.5 17.5,12.0 17.0,12.4',
  // the lower link
  'M13.4,10.7 C14.6,12.0 14.4,14.0 13.1,15.3 C12.2,16.2 11.3,17.1 10.4,18.0 C9.0,19.4 6.7,19.3 5.4,18.0 C4.0,16.6 4.1,14.4 5.5,13.0 C6.0,12.5 6.5,12.0 7.0,11.6',
] as const;
