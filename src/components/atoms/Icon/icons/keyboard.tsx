import type { IconRenderProps } from '../types';

// "Keyboard" (鍵盤) — the composer's way back from the sticker panel: a slab
// drawn in one pen, its line running on past where it began, one row of
// keys as short dabs, the space bar a long, slightly sagging stroke (the owner's pick, round 22).
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
      {/* one row of keys, as short dabs */}
      <path d="M7.2,10.3 L7.7,10.3" />
      <path d="M10.4,10.2 L10.9,10.2" />
      <path d="M13.6,10.2 L14.1,10.2" />
      <path d="M16.6,10.3 L17.0,10.3" />
      {/* space bar, slightly sagging */}
      <path d="M8.4,14.3 C10.9,14.6 13.4,14.6 15.8,14.2" />
    </svg>
  );
}
