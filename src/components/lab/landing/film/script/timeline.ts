/**
 * The film's script as a table (SPEC §5.1): thirteen segments along film time s (seconds) and along the scroll track
 * y (in svh), each an act (played on its own clock), a travel or a change (scrubbed by the scroll), or the closing
 * hold. Pure: y ↔ s both ways, which segment and which scene an s or a y is in.
 */
export type SegKind = 'act' | 'travel' | 'change' | 'hold';
export type SegId = 'write' | 'wind' | 'c1' | 'journey' | 'catch' | 'read' | 'reply' | 'c2' | 'bridge' | 'meet' | 'c3' | 'yours' | 'rest';
export type SceneN = 1 | 2 | 3 | 4;

export interface Segment {
  index: number;
  id: SegId;
  kind: SegKind;
  /** Film seconds. */
  t0: number;
  t1: number;
  /** Track length and start, svh. */
  svh: number;
  y0: number;
  y1: number;
  /** The scene the segment belongs to (a change belongs to the scene it leaves). */
  scene: SceneN;
  /** An act's length in seconds (t1 − t0); 0 for the hold. */
  dur: number;
}

/**
 * Round 3 (the owner: 「現在的動畫普遍都有一個太快的問題…全部都慢一點…也包括這個轉場動畫…卡片在移動什麼那種，那種
 * 不要變慢好了…這影片可能還是要有一點點留白」): the acting about 1.4× slower, each act ending in a quiet moment of idle
 * life (after the card has grown into view, the catch, the reading, the pair, the meeting); the changes 3.2–3.4 s
 * over 100 svh each; the travels a little slower. The cards' own flights keep their pace (beats.ts).
 */
const ROWS: [SegId, SegKind, number, number, number, SceneN][] = [
  ['write', 'act', 0, 9.4, 35, 1],
  ['wind', 'travel', 9.4, 12.4, 45, 1],
  ['c1', 'change', 12.4, 15.6, 100, 1],
  ['journey', 'travel', 15.6, 20.4, 80, 2],
  ['catch', 'act', 20.4, 24.2, 40, 2],
  ['read', 'act', 24.2, 29.5, 45, 2],
  ['reply', 'act', 29.5, 39.1, 55, 2],
  ['c2', 'change', 39.1, 42.3, 100, 2],
  ['bridge', 'travel', 42.3, 44.9, 45, 3],
  ['meet', 'act', 44.9, 54.7, 60, 3],
  ['c3', 'change', 54.7, 58.1, 100, 3],
  ['yours', 'act', 58.1, 67.3, 60, 4],
  ['rest', 'hold', 67.3, 67.3, 40, 4],
];

export const SEGMENTS: Segment[] = (() => {
  let y = 0;
  return ROWS.map(([id, kind, t0, t1, svh, scene], index) => {
    const seg: Segment = { index, id, kind, t0, t1, svh, y0: y, y1: y + svh, scene, dur: Math.round((t1 - t0) * 1000) / 1000 };
    y += svh;
    return seg;
  });
})();

export const SEG = Object.fromEntries(SEGMENTS.map((s) => [s.id, s])) as Record<SegId, Segment>;
/** The whole track, svh (the stage releases after it). */
export const TRACK_SVH = SEGMENTS[SEGMENTS.length - 1].y1;
/** The film's last second. */
export const FILM_END = SEGMENTS[SEGMENTS.length - 1].t1;

/** The four scenes: where each starts (s, y), its anchor and its index into the copy. */
export interface Scene {
  n: SceneN;
  hash: 'write' | 'answer' | 'meet' | 'yours';
  t0: number;
  y0: number;
}
export const SCENES: Scene[] = [
  { n: 1, hash: 'write', t0: 0, y0: 0 },
  { n: 2, hash: 'answer', t0: SEG.journey.t0, y0: SEG.journey.y0 },
  { n: 3, hash: 'meet', t0: SEG.bridge.t0, y0: SEG.bridge.y0 },
  { n: 4, hash: 'yours', t0: SEG.yours.t0, y0: SEG.yours.y0 },
];

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Where s is between a and b, 0…1. */
export const span = (s: number, a: number, b: number) => (b === a ? (s >= b ? 1 : 0) : clamp01((s - a) / (b - a)));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
/** A bell over [a, b] (0 at both ends, 1 in the middle), or over 0…1. */
export const bell = (v: number, a = 0, b = 1) => Math.sin(Math.PI * span(v, a, b));
export const easeIn = (u: number) => u ** 3;
export const easeOut = (u: number) => 1 - (1 - u) ** 3;
export const easeInOut = (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

/** The segment a film time is in: the one with t0 ≤ s < t1; the hold from the film's end on. */
export function segmentAtS(s: number): Segment {
  if (s >= FILM_END) return SEG.rest;
  for (const seg of SEGMENTS) if (seg.kind !== 'hold' && s < seg.t1) return seg;
  return SEG.rest;
}

/** The segment a track position (svh) is in. */
export function segmentAtY(y: number): Segment {
  for (const seg of SEGMENTS) if (y < seg.y1) return seg;
  return SEGMENTS[SEGMENTS.length - 1];
}

/** Film time at a track position (svh): linear within each segment; the hold keeps the film's end. */
export function sOfY(y: number): number {
  if (y <= 0) return 0;
  const seg = segmentAtY(y);
  return lerp(seg.t0, seg.t1, clamp01((y - seg.y0) / seg.svh));
}

/** The track position (svh) where film time s is first reached. */
export function yOfS(s: number): number {
  if (s <= 0) return 0;
  for (const seg of SEGMENTS) {
    if (seg.kind === 'hold') continue;
    if (s <= seg.t1) return lerp(seg.y0, seg.y1, span(s, seg.t0, seg.t1));
  }
  return SEG.rest.y0;
}

/** The scene a film time is in: the last scene starting at or before it. */
export function sceneAtS(s: number): Scene {
  let out = SCENES[0];
  for (const sc of SCENES) if (s >= sc.t0) out = sc;
  return out;
}

/** The scene whose planes stand at s (a change hands them over at its end). */
export function placeSceneAtS(s: number): SceneN {
  const seg = segmentAtS(s);
  return seg.scene;
}

/** The change a film time is inside, and its position p (0…1), or null. */
export function changeAt(s: number): { seg: Segment; p: number; from: SceneN; to: SceneN } | null {
  const seg = segmentAtS(s);
  if (seg.kind !== 'change') return null;
  return { seg, p: span(s, seg.t0, seg.t1), from: seg.scene, to: (seg.scene + 1) as SceneN };
}
