import type { IconRenderProps } from '../types';

// A tick in one quick hand: the pen lands with a small curl, runs down into a
// rounded valley (no sharp corner), and leaves on a long stroke with a belly
// that eases flatter toward its tip — never the ruler-straight diagonal.
export function CheckIcon({ size = 22, strokeWidth = 1.8, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M3.8,13.6 C5.2,12.6 6.9,13.7 8.3,15.6 C8.9,16.4 9.5,17.4 10.0,18.2 C10.3,18.7 10.8,18.6 11.0,18.0 C12.0,15.0 13.3,12.0 15.2,9.5 C16.8,7.4 18.6,5.9 20.6,4.9" />
    </svg>
  );
}
