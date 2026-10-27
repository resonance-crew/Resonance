import type { IconRenderProps } from '../types';

// The selected 卡片盒 tab: the cards' solid twin — the front card filled, its
// two lines knocked out of it (even-odd holes), the card behind still the
// outline's corner stroke.
export function CardsFillIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
  const front =
    'M4.6,8.2 C8.0,7.6 12.0,7.8 15.2,8.4 C15.7,11.4 15.5,15.6 15.1,19.3 C11.5,19.9 7.6,19.7 4.7,19.3 C4.2,15.8 4.9,11.6 4.6,8.2 Z';
  const lines =
    ' M6.8,11.0 C8.6,10.7 11.0,10.8 12.9,11.1 C13.5,11.2 13.4,12.7 12.9,12.7 C11.0,12.4 8.6,12.3 6.8,12.6 C6.2,12.6 6.2,11.1 6.8,11.0 Z' +
    ' M6.9,13.9 C8.4,13.7 10.2,13.7 11.6,13.9 C12.2,14.0 12.1,15.5 11.6,15.5 C10.2,15.3 8.4,15.3 6.9,15.5 C6.3,15.5 6.3,14.0 6.9,13.9 Z';
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
      <path d="M9.0,4.6 C12.3,4.1 16.4,4.3 19.2,4.9 C19.7,7.9 19.5,11.4 19.2,14.2" />
      <path d={front + lines} fill={color} fillRule="evenodd" stroke="none" />
      <path d={front} />
    </svg>
  );
}
