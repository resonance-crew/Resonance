import type { IconRenderProps } from '../types';
import { LINK_PATHS } from './linkPaths';

// Two chain links hooked together on the diagonal — "link": each an open
// loop, the pen leaving a gap where the other passes through.
export function LinkIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {LINK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
