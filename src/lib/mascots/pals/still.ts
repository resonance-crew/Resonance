/**
 * The Paper Pals page (/paper-pals) draws the five standing still from the same part images the stage animates: each
 * part laid where the rig drew it, at rest, so the server's HTML already holds the group photo. Pure layout, no DOM:
 * PaperPalStill renders what `stillOf` answers.
 *
 * A still is measured in `unit`s — the px 摺摺's 420 rig units take — and sized by the engine's height curve, so the
 * five stand at the heights they have on the landing page (牽牽 a little taller, 點點 a little smaller, never to scale).
 */
import type { CastEntry, RigPart } from '../types';

/** The engine's `heightCurve` (DEFAULT_OPTIONS): height = unit × (rig height / 420) ^ 0.75. */
export const STILL_HEIGHT_CURVE = 0.75;

/** The cast by the page's profiles: the bill's order, 摺摺 first. */
export const PAL_SLUGS = ['tuck', 'tag', 'card', 'dot', 'night'] as const;
export type PalSlug = (typeof PAL_SLUGS)[number];

export function isPalSlug(s: string): s is PalSlug {
  return (PAL_SLUGS as readonly string[]).includes(s);
}

/** The group photo, left to right: the tallest in the middle, the smaller ones toward the ends, as a class photo stands. */
export const PHOTO_ORDER: readonly PalSlug[] = ['dot', 'tuck', 'tag', 'night', 'card'];

/** Where an arm points, raised to wave (0 = right, 90 = down): up and out on its own side. */
const RAISED: Record<'l' | 'r', number> = { l: 236, r: -56 };

export interface StillPart {
  name: string;
  src: string;
  /** The box, % of the still's frame. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** In the body (it breathes) or on the ground (the shadow and the legs). */
  layer: 'root' | 'body';
  /** A variant shown instead of this base part (eye-l-shut of eye-l…); absent on a base part. */
  variantOf?: string;
  /** Shown on this page theme only (悄悄's stars' glow). */
  only?: 'light' | 'dark';
  /** An arm: its side, its pivot (% of its own box, for transform-origin) and the turn that raises it to wave. */
  arm?: { side: 'l' | 'r'; origin: [number, number]; lift: number };
}

export interface Still {
  slug: string;
  name: string;
  parts: StillPart[];
  /** The frame in units (width, height) and how much of its height lies under the ground line (the shadow). */
  w: number;
  h: number;
  below: number;
  /** The body's pivot (where the torso sits on the legs), % of the frame: what it breathes about. */
  bodyOrigin: [number, number];
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Rig units → units: a character `height` rig units tall stands `(height / 420) ^ curve` units. */
export function unitsPerRigUnit(height: number): number {
  return (height / 420) ** STILL_HEIGHT_CURVE / height;
}

/** `entry` standing at rest, laid out in its frame. */
export function stillOf(entry: CastEntry): Still {
  const m = entry.manifest;
  const parts = m.parts;
  const height = m.height ?? 420;
  const k = unitsPerRigUnit(height);
  const x0 = Math.min(...parts.map((p) => p.x));
  const y0 = Math.min(...parts.map((p) => p.y));
  const x1 = Math.max(...parts.map((p) => p.x + p.w));
  const y1 = Math.max(...parts.map((p) => p.y + p.h));
  const W = x1 - x0;
  const H = y1 - y0;
  const pct = (v: number, of: number) => round((v / of) * 100);
  const torso = parts.find((p) => p.name === 'torso');
  const pivot = torso?.pivot ?? m.ground;
  return {
    slug: entry.slug,
    name: m.name ?? entry.slug,
    w: round(W * k, 4),
    h: round(H * k, 4),
    below: round((y1 - m.ground[1]) / H, 4),
    bodyOrigin: [pct(pivot[0] - x0, W), pct(pivot[1] - y0, H)],
    parts: [...parts]
      .sort((a, b) => a.z - b.z)
      .map((p): StillPart => ({
        name: p.name,
        src: entry.base + p.img,
        left: pct(p.x - x0, W),
        top: pct(p.y - y0, H),
        width: pct(p.w, W),
        height: pct(p.h, H),
        layer: p.parent === 'root' ? 'root' : 'body',
        ...(p.variantOf ? { variantOf: p.variantOf } : {}),
        ...(p.only ? { only: p.only } : {}),
        ...armOf(p),
      })),
  };
}

function armOf(p: RigPart): Pick<StillPart, 'arm'> {
  const side = p.name === 'arm-l' ? 'l' : p.name === 'arm-r' ? 'r' : null;
  if (!side || p.angle == null) return {};
  return {
    arm: {
      side,
      origin: [round(((p.pivot[0] - p.x) / p.w) * 100), round(((p.pivot[1] - p.y) / p.h) * 100)],
      lift: round(RAISED[side] - p.angle, 1),
    },
  };
}
