import type { IconRenderProps } from '../types';

// The selected 私訊 tab: the bubble's solid twin — filled, its two lines of
// writing knocked out of it (even-odd holes, so whatever is behind shows
// through: a colour inversion, not a second colour), ringed by its pen line.
export function ChatFillIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
  const bubble =
    'M4.2,5.9 C9.4,5.5 14.9,5.5 20.0,5.9 C20.4,9.2 20.3,12.5 20.0,15.7 C16.3,16.1 12.5,16.2 8.8,16.0 C7.4,17.5 5.9,18.9 4.4,20.2 C4.3,15.4 4.1,10.7 4.2,5.9 Z';
  const lines =
    ' M8.3,9.0 C10.9,8.8 13.5,8.8 16.0,9.0 C16.6,9.05 16.6,10.55 16.0,10.6 C13.5,10.4 10.9,10.4 8.3,10.6 C7.7,10.6 7.7,9.05 8.3,9.0 Z' +
    ' M8.4,11.6 C10.3,11.5 12.2,11.5 14.1,11.6 C14.7,11.65 14.7,13.15 14.1,13.2 C12.2,13.1 10.3,13.1 8.4,13.2 C7.8,13.2 7.8,11.65 8.4,11.6 Z';
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
      <path d={bubble + lines} fill={color} fillRule="evenodd" stroke="none" />
      <path d={bubble} />
    </svg>
  );
}
