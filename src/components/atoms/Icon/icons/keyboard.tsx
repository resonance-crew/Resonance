import type { IconRenderProps } from '../types';

// "Keyboard" (鍵盤) — the composer's way back from the sticker panel: a slab
// drawn in one pen, its line running on past where it began, three rows of
// keys as short dabs, the space bar a long, slightly sagging stroke.
export function KeyboardIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* slab, its pen running on past the start */}
      <path d="M4.9,6.1 C9.6,5.8 14.3,5.8 19.0,5.9 C19.9,5.9 20.4,6.5 20.4,7.3 C20.5,10.4 20.5,13.6 20.4,16.7 C20.4,17.5 19.8,18.0 19.0,18.0 C14.3,18.2 9.6,18.2 4.9,18.0 C4.1,18.0 3.6,17.4 3.6,16.6 C3.5,13.5 3.5,10.4 3.6,7.4 C3.6,6.6 4.1,6.1 4.9,6.1 C5.8,6.1 6.6,6.1 7.4,6.0" />
      {/* keys */}
      <path d="M7.0,9.4 L7.5,9.4" />
      <path d="M10.3,9.3 L10.8,9.3" />
      <path d="M13.5,9.3 L14.0,9.3" />
      <path d="M16.7,9.4 L17.1,9.4" />
      <path d="M8.6,12.2 L9.1,12.2" />
      <path d="M11.9,12.1 L12.4,12.1" />
      <path d="M15.2,12.2 L15.6,12.2" />
      {/* space bar */}
      <path d="M8.3,15.1 C10.8,15.4 13.4,15.4 15.9,15.0" />
    </svg>
  );
}
