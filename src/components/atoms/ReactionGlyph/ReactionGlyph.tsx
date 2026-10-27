import { REACTION_COLOURS, REACTION_GLYPHS, type ReactionColour, type ReactionId } from '@/lib/design/reactions';

/** A sticker colour; the rim follows the scheme (the palette's reaction-outline), the rest are the sticker's own. */
const paint = (c: ReactionColour) => (c === 'outline' ? 'var(--reaction-outline)' : REACTION_COLOURS[c]);

/**
 * One of the five message reactions (round 16 §4), drawn from
 * lib/design/reactions — the hand-drawn stickers the apps draw from the same
 * data. Decorative: the control or chip that holds it says what it means.
 */
export function ReactionGlyph({ id, size = 24 }: { id: ReactionId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {REACTION_GLYPHS[id].map((layer, i) => (
        <path
          key={i}
          d={layer.d}
          fill={layer.fill ? paint(layer.fill) : 'none'}
          stroke={layer.stroke ? paint(layer.stroke) : 'none'}
          strokeWidth={layer.width}
          opacity={layer.opacity}
          transform={layer.offset ? `translate(${layer.offset[0]} ${layer.offset[1]})` : undefined}
        />
      ))}
    </svg>
  );
}
