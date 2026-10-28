/**
 * A character's manifest: checked once when it comes in (a JSON import is only `unknown` until then), and read once
 * into what the engine needs from it — legs, arms, face, how wide and tall it stands, what its variants hide.
 */
import { clamp, DEG, lerp } from './geometry';
import type { ArmSide, Manifest, Point, RevealInfo, RigPart, Theme } from './types';

/** Parts every rig has (the kit's exporter refuses a rig without them). */
const REQUIRED = ['shadow', 'torso', 'leg-l', 'leg-r', 'arm-l', 'arm-r', 'eye-l', 'eye-r', 'mouth'] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function bad(what: string): never {
  throw new Error(`mascot manifest: ${what}`);
}
function point(v: unknown, what: string): Point {
  if (!Array.isArray(v) || v.length < 2 || !isNum(v[0]) || !isNum(v[1])) bad(`${what} is not [x, y]`);
  return [v[0], v[1]];
}
function optPoint(v: unknown, what: string): Point | undefined {
  return v == null ? undefined : point(v, what);
}
function num(v: unknown, what: string): number {
  if (!isNum(v)) bad(`${what} is not a number`);
  return v;
}
function optNum(v: unknown, what: string): number | null | undefined {
  return v === null ? null : v === undefined ? undefined : num(v, what);
}
function optStr(v: unknown, what: string): string | null | undefined {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'string') bad(`${what} is not a string`);
  return v;
}

function readPart(v: unknown, i: number): RigPart {
  if (!isObj(v)) bad(`part ${i} is not an object`);
  const name = v.name;
  if (typeof name !== 'string' || !name) bad(`part ${i} has no name`);
  const at = (key: string) => `${name}.${key}`;
  const parent = v.parent;
  if (parent !== 'root' && parent !== 'body' && parent !== 'face') bad(`${at('parent')} is not root, body or face`);
  if (typeof v.img !== 'string') bad(`${at('img')} is not a string`);
  const only: Theme | null | undefined =
    v.only === 'light' || v.only === 'dark' || v.only === null || v.only === undefined ? v.only : bad(`${at('only')} is not light or dark`);
  const part: RigPart = {
    name, parent, pivot: point(v.pivot, at('pivot')),
    angle: optNum(v.angle, at('angle')), len: optNum(v.len, at('len')),
    variantOf: optStr(v.variantOf, at('variantOf')), only, hides: optStr(v.hides, at('hides')),
    z: num(v.z, at('z')), x: num(v.x, at('x')), y: num(v.y, at('y')), w: num(v.w, at('w')), h: num(v.h, at('h')), img: v.img,
  };
  if (v.hit != null) {
    if (!Array.isArray(v.hit)) bad(`${at('hit')} is not a list`);
    part.hit = v.hit.map((p, j) => point(p, `${at('hit')}[${j}]`));
  }
  if (v.reveal != null) {
    const r = v.reveal;
    if (!isObj(r)) bad(`${at('reveal')} is not an object`);
    const reveal: RevealInfo = {
      at: point(r.at, at('reveal.at')), frac: num(r.frac, at('reveal.frac')), spread: num(r.spread, at('reveal.spread')),
    };
    const tip = optPoint(r.tip, at('reveal.tip'));
    if (tip) reveal.tip = tip;
    part.reveal = reveal;
  }
  return part;
}

/**
 * A manifest as the kit's exporter writes it (with the torso's `hit` and torso-alt's `reveal` the stage's build adds),
 * checked and copied. Throws on anything the engine could not draw.
 */
export function readManifest(raw: unknown): Manifest {
  if (!isObj(raw)) bad('not an object');
  if (!Array.isArray(raw.parts)) bad('parts is not a list');
  const parts = raw.parts.map(readPart);
  for (const name of REQUIRED) if (!parts.some(p => p.name === name)) bad(`no ${name} part`);
  const walk = raw.walk;
  if (walk != null && walk !== 'walk' && walk !== 'hop') bad('walk is not walk or hop');
  const m: Manifest = { ground: point(raw.ground, 'ground'), parts };
  const name = optStr(raw.name, 'name');
  if (name != null) m.name = name;
  const prefix = optStr(raw.prefix, 'prefix');
  if (prefix != null) m.prefix = prefix;
  const face = optPoint(raw.faceCenter, 'faceCenter');
  if (face) m.faceCenter = face;
  const height = optNum(raw.height, 'height');
  if (height != null) m.height = height;
  if (walk != null) m.walk = walk;
  const viewBox = optPoint(raw.viewBox, 'viewBox');
  if (viewBox) m.viewBox = viewBox;
  const scale = optNum(raw.scale, 'scale');
  if (scale != null) m.scale = scale;
  return m;
}

/**
 * How far along an arm (brad to the far corner of its image's box, its `len`) the middle of its mitten is: measured
 * on the cast's arm images, 0.63 (點點) to 0.69 of it. What a mitten grips goes through here.
 */
export const MITTEN_MIDDLE = 0.67;

export interface Arm {
  part: RigPart;
  name: string;
  side: ArmSide;
  /** Its drawn angle, and the lift that is its rest (the stage's lift: 0 = hanging straight down). */
  theta: number;
  rest: number;
  /** Brad to the far end of its mitten, rig units. */
  len: number;
  pivot: Point;
}

/** What a rig gives the engine, in rig units, the ground point at (gx, gy). */
export interface RigInfo {
  parts: Map<string, RigPart>;
  gx: number;
  gy: number;
  torso: RigPart;
  /** The torso's pivot: the body turns and squashes about it. */
  tp: Point;
  legLen: number;
  hipY: number;
  hipX: number;
  /** The drawing's extent about the ground point (left, right, top), shadow and variants left out. */
  box: { l: number; r: number; t: number };
  height: number;
  bodyH: number;
  arms: Record<ArmSide, Arm>;
  face: Point;
  eyes: readonly [Point, Point];
  deco: RigPart | undefined;
  decoH0: number;
  /** Sitting on the floor: the legs' splay and how much they foreshorten. */
  floorAng: number;
  floorS: number;
  torsoHalf: number;
  floorHalf: number;
  /** Variant → the parts it hides. */
  hides: Map<string, string[]>;
  /** A small secret on torso-alt a mitten can reach to lift, else null. */
  revealAt: Point | null;
  has(name: string): boolean;
}

function need(parts: Map<string, RigPart>, name: string): RigPart {
  const p = parts.get(name);
  if (!p) bad(`no ${name} part`);
  return p;
}

export function rigInfo(m: Manifest): RigInfo {
  const parts = new Map(m.parts.map(p => [p.name, p]));
  const [gx, gy] = m.ground;
  const torso = need(parts, 'torso');
  const legL = need(parts, 'leg-l');
  const legR = need(parts, 'leg-r');
  const legLen = legL.len || gy - legL.pivot[1];
  let l = Infinity;
  let r = -Infinity;
  let t = Infinity;
  for (const p of m.parts) {
    if (p.variantOf || p.only || p.name === 'shadow' || !p.w) continue;
    l = Math.min(l, p.x - gx);
    r = Math.max(r, p.x + p.w - gx);
    t = Math.min(t, p.y - gy);
  }
  const arms: Partial<Record<ArmSide, Arm>> = {};
  for (const name of ['arm-l', 'arm-r']) {
    const p = need(parts, name);
    // by where the brad is, not by name: the second arm takes the other side if both sit on one
    let side: ArmSide = p.pivot[0] < gx ? 'L' : 'R';
    if (arms[side]) side = side === 'L' ? 'R' : 'L';
    const th = p.angle ?? (side === 'L' ? 100 : 80);
    const ux = Math.cos(th * DEG);
    const uy = Math.sin(th * DEG);
    let len = 0;
    for (const [cx, cy] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]])
      len = Math.max(len, (cx - p.pivot[0]) * ux + (cy - p.pivot[1]) * uy);
    arms[side] = { part: p, name, side, theta: th, rest: side === 'L' ? th - 90 : 90 - th, len, pivot: p.pivot };
  }
  if (!arms.L || !arms.R) bad('arms');
  const deco = parts.get('deco');
  // sitting on the floor: long legs stretch forward (a smaller splay, foreshortened) instead of doing the splits
  const lt = clamp((legLen - 100) / 80, 0, 1);
  const floorAng = lerp(78, 35, lt);
  const floorS = lerp(0.22, 0.5, lt);
  const hipX = Math.max(Math.abs(legL.pivot[0] - gx), Math.abs(legR.pivot[0] - gx));
  const torsoHalf = Math.max(gx - torso.x, torso.x + torso.w - gx);
  const hides = new Map(
    m.parts.filter(p => p.hides).map(p => [p.name, String(p.hides).split(/[\s,]+/).filter(Boolean)] as const),
  );
  const alt = parts.get('torso-alt');
  const reveal = alt && alt.reveal;
  return {
    parts, gx, gy, torso, tp: torso.pivot, legLen, hipY: Math.min(legL.pivot[1], legR.pivot[1]), hipX,
    box: { l, r, t }, height: m.height || gy - torso.y, bodyH: torso.pivot[1] - torso.y, arms: { L: arms.L, R: arms.R },
    face: m.faceCenter || [gx, torso.y + torso.h * 0.4],
    eyes: [need(parts, 'eye-l').pivot, need(parts, 'eye-r').pivot], deco, decoH0: Math.max(0, torso.y - (t + gy)),
    floorAng, floorS, torsoHalf,
    floorHalf: Math.max(torsoHalf, hipX + legLen * (1 - floorS) * Math.sin(floorAng * DEG) + 24),
    hides, revealAt: reveal && reveal.frac < 0.4 ? reveal.tip || reveal.at : null,
    has: (name: string) => parts.has(name),
  };
}
