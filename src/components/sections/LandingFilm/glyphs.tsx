/**
 * The player's glyphs: absolute paths on a 24 viewBox, drawn by hand as the site's icons are (round 4, the owner:
 * 「播放按鈕也要重新生成這個 SVG，讓它變成 organic 的播放按鈕」) — play a soft, slightly uneven triangle, pause two bars
 * of a brush (neither quite the other's height), replay an open circle with an arrow, down a pen's arrow.
 */
import { INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';

export type GlyphName = 'play' | 'pause' | 'replay' | 'down';

const PATHS: Record<GlyphName, { fill?: string; stroke?: string }> = {
  play: { fill: 'M8.4 5.2C7.5 4.6 6.5 5.2 6.5 6.3C6.3 10.1 6.4 14 6.6 17.8C6.7 18.9 7.7 19.5 8.6 18.9C11.7 16.9 14.8 14.9 17.8 12.8C18.6 12.3 18.6 11.4 17.8 10.9C14.7 9 11.6 7.1 8.4 5.2Z' },
  pause: {
    fill: 'M8.1 5.4C8.9 5.3 9.9 5.6 10 6.5C10.2 10.2 10.1 14 9.9 17.7C9.9 18.5 8.9 18.8 8 18.7C7.2 18.7 6.7 18.2 6.7 17.5C6.6 13.8 6.6 10.1 6.8 6.5C6.8 5.8 7.3 5.4 8.1 5.4ZM15.3 5.2C16.1 5.2 17.1 5.5 17.2 6.4C17.4 10.2 17.3 14 17.2 17.8C17.2 18.6 16.3 19 15.4 18.9C14.6 18.9 14 18.5 13.9 17.8C13.7 14 13.8 10.2 13.9 6.5C13.9 5.7 14.5 5.2 15.3 5.2Z',
  },
  replay: { stroke: 'M5.2 12.4C5.1 8.4 8.2 5.1 12.2 5.1C16.1 5.2 19 8.3 18.9 12.2C18.8 16 15.8 18.9 12 18.9C10 18.9 8.3 18.1 7.1 16.8M4.6 8.1L5.2 12.6L9.3 10.9' },
  down: { stroke: 'M12 4.8C12.2 9.2 11.9 13.6 12 18.6M6.1 12.8C8 14.7 10 16.6 12 18.8C14 16.8 16 14.8 17.9 12.7' },
};

export function Glyph({ name, size = 22 }: { name: GlyphName; size?: number }) {
  const p = PATHS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      {p.fill && <path d={p.fill} fill="currentColor" stroke="currentColor" strokeWidth={INK_LIGHT} strokeLinejoin="round" />}
      {p.stroke && <path d={p.stroke} fill="none" stroke="currentColor" strokeWidth={INK_STRONG} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
