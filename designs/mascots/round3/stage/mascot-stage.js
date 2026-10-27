// mascot-stage.js — the landing page's paper puppets: a small stage engine, no framework, no dependencies.
//
//   import { createStage, loadCast } from './mascot-stage.js';
//   const cast = await loadCast([{ slug: 'tuck', base: 'cast/tuck/' }, …]);  // reads <base>manifest.json when missing
//   const stage = createStage(env, cast, { size: 1, fps: 12, onEvent });
//
// env is everything the engine knows about the page:
//   layer          an element covering the whole page; the engine draws inside it, in its coordinates ("page px")
//   ledges         ledges in page px (array, or a function returning one) — see README.md and ledges.json
//   viewport()     the part of the page in view, { x, y, w, h }
//   unitHeight     px for a character 420 rig units tall (摺摺): 120 on a desktop, 80 on a phone; the others follow
//                  their own height through options.heightCurve (taller ones a little less tall, small ones a little
//                  less small)
//   content        optional: rects of words and buttons (array, or a function returning one) the props keep off
//   behind(root, cover)   optional: show this character's element behind `cover` ({ x, y, w, h, top?, radius?, depth })
//                  and return a function undoing it; without one the engine clips the character itself
//   theme          'light' | 'dark'         reducedMotion   boolean
//   clock          optional { now(), raf(fn), caf(id), timers?: { set(fn, ms), clear(id) } }   random   optional () => [0, 1)
//
// A cast entry is { slug, base, manifest, traits? }: the manifest written by kit/export-parts.mjs, part images at
// base + part.img. traits: { pace, likes: [activity…], naps, shuffle, openStretch, zones: { light|dark: { zone: × } },
// often: { light|dark: × } } (all optional).
//
// Characters are DOM: root → body → face, one <img> per part, CSS transforms about the rig's pivots, variants by
// visibility. Only transform, opacity and visibility change per frame (clip-path only while behind an element
// without env.behind). Poses step 12 times a second by default (cut-paper stop motion) while positions move 24 times
// a second; fps: 0 is smooth. Only an invisible shape over each torso takes the pointer.

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const bell = (u, a = 0.2, b = a) => smooth(u / a) * smooth((1 - u) / b);   // 0 → 1 → 0 across [0, 1]
const easeOut = u => 1 - (1 - clamp(u, 0, 1)) ** 3;
const spd = s => (typeof s === 'function' ? s() : s);
const hit = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w > b.x - m && a.y < b.y + b.h + m && a.y + a.h > b.y - m;

export const ACT_LABELS = {
  read: '讀一本小書', swing: '晃腳', look: '東張西望', wave: '揮手', stretch: '伸懶腰', hop: '原地跳', deco: '整理頭飾',
  reveal: '掀開自己的祕密', twinkle: '星星閃一閃', point: '指給你看', beckon: '招手', lean: '靠著按鈕', write: '寫一張小紙條遞過去',
  nap: '打個盹', duck: '躲貓貓',
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// y of a polyline [[x, y], …] (x ascending) at x, flat past its ends
export function pathY(points, x) {
  const n = points.length;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid][0] <= x) lo = mid; else hi = mid; }
  const [x0, y0] = points[lo], [x1, y1] = points[hi];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1);
}
// the highest point of a polyline across [x0, x1] (feet rest on the tallest thing under them)
function topY(points, x0, x1) {
  let y = Math.min(pathY(points, x0), pathY(points, x1));
  for (const [px, py] of points) if (px > x0 && px < x1) y = Math.min(y, py);
  return y;
}

export async function loadCast(list, getJson = url => fetch(url).then(r => r.json())) {
  return Promise.all(list.map(async c => ({ ...c, manifest: c.manifest || await getJson(c.base + 'manifest.json') })));
}

export function createStage(env, cast, options) {
  return new Stage(env, cast, options).api();
}

// ---------------------------------------------------------------------------------------------------------------
// What a rig gives the engine, read once from its manifest (rig units, the ground point at m.ground)
function rigInfo(m) {
  const parts = new Map(m.parts.map(p => [p.name, p]));
  const [gx, gy] = m.ground;
  const torso = parts.get('torso'), legL = parts.get('leg-l'), legR = parts.get('leg-r');
  const legLen = legL.len || gy - legL.pivot[1];
  let l = Infinity, r = -Infinity, t = Infinity;
  for (const p of m.parts) {
    if (p.variantOf || p.only || p.name === 'shadow' || !p.w) continue;
    l = Math.min(l, p.x - gx); r = Math.max(r, p.x + p.w - gx); t = Math.min(t, p.y - gy);
  }
  const arms = {};
  for (const name of ['arm-l', 'arm-r']) {
    const p = parts.get(name);
    let side = p.pivot[0] < gx ? 'L' : 'R';
    if (arms[side]) side = side === 'L' ? 'R' : 'L';
    const th = p.angle ?? (side === 'L' ? 100 : 80), ux = Math.cos(th * DEG), uy = Math.sin(th * DEG);
    let len = 0;
    for (const [cx, cy] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]])
      len = Math.max(len, (cx - p.pivot[0]) * ux + (cy - p.pivot[1]) * uy);
    arms[side] = { part: p, name, side, theta: th, rest: side === 'L' ? th - 90 : 90 - th, len, pivot: p.pivot };
  }
  const deco = parts.get('deco');
  // sitting on the floor: long legs stretch forward (a smaller splay, foreshortened) instead of doing the splits
  const lt = clamp((legLen - 100) / 80, 0, 1), floorAng = lerp(78, 35, lt), floorS = lerp(0.22, 0.5, lt);
  const hipX = Math.max(Math.abs(legL.pivot[0] - gx), Math.abs(legR.pivot[0] - gx));
  const torsoHalf = Math.max(gx - torso.x, torso.x + torso.w - gx);
  const hides = new Map(m.parts.filter(p => p.hides).map(p => [p.name, String(p.hides).split(/[\s,]+/).filter(Boolean)]));
  const alt = parts.get('torso-alt');
  return {
    parts, gx, gy, torso, tp: torso.pivot, legLen, hipY: Math.min(legL.pivot[1], legR.pivot[1]), hipX,
    box: { l, r, t }, height: m.height || gy - torso.y, bodyH: torso.pivot[1] - torso.y, arms, face: m.faceCenter || [gx, torso.y + torso.h * 0.4],
    eyes: [parts.get('eye-l').pivot, parts.get('eye-r').pivot], deco, decoH0: Math.max(0, torso.y - (t + gy)),
    floorAng, floorS, torsoHalf, floorHalf: Math.max(torsoHalf, hipX + legLen * (1 - floorS) * Math.sin(floorAng * DEG) + 24),
    hides, revealAt: alt && alt.reveal && alt.reveal.frac < 0.4 ? alt.reveal.tip || alt.reveal.at : null,
    has: name => parts.has(name),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Motion building blocks. A task is a generator stepped once per frame; S.dt is the frame's step in seconds.
// A task writes the frame's pose (reset to the stance's baseline every frame), so a task that ends leaves nothing.
function* during(S, dur, fn) {
  for (let t = 0; t < dur; t += S.dt) { if (fn) fn(clamp(t / dur, 0, 1), t); yield; }
}
function* all(gens) {
  const live = gens.map(g => ({ g, done: false }));
  for (;;) {
    for (const x of live) if (!x.done) x.done = x.g.next().done;
    if (live.every(x => x.done)) return;
    yield;
  }
}
const aimLift = (ch, side, deg) => {   // absolute screen angle (0 = right, 90 = down) → that arm's lift
  const raw = side === 'L' ? deg - 90 : 90 - deg;
  return ((raw + 450) % 360) - 90;   // into [-90, 270)
};
const mouthOpen = ch => (ch.rig.has('mouth-open') ? 'mouth-open' : 'mouth-o');

function walkPose(ch, dir, amp) {
  const p = ch.pose, g = ch.gait, s = Math.sin(ch.phase);
  const a = g.swing * amp * s;
  p.legL += -dir * a; p.legR += dir * a;
  p.rise -= ch.rig.legLen * (1 - Math.cos(a * DEG));   // spread legs lower the hips: the feet stay on the ground
  p.liftL += dir * g.arm * amp * s; p.liftR += dir * g.arm * amp * s;
  p.tilt += dir * 4 * amp; p.faceX += dir * 10 * Math.min(1, amp * 2);
  p.bodyUp += 2.5 * amp * Math.abs(Math.cos(ch.phase));
}

// a speed factor that gets `dist` px walked (or hopped) in about `limit` seconds: a scurry, never more than 2.6×
function quick(ch, dist, limit) {
  const v = ch.pace() * (1 + 0.35 * smooth((dist - 220) / 360));   // with the trot a long way gets anyway
  return clamp(dist / (v * limit), 1, 2.6);
}

function* walkTo(S, ch, x1, speed = 1) {
  const dir = Math.sign(x1 - ch.x) || 1, k = ch.k, stridePx = ch.gait.stride * k;
  let t = 0;
  for (;;) {
    const rem = Math.abs(x1 - ch.x);
    if (rem < 0.5) { ch.x = x1; ch.y = ch.surface(ch.x); return; }
    const hurry = 1 + 0.8 * smooth((rem - 220) / 360);   // trot while far away, so long walks don't eat the visit
    const v = ch.gait.speed * k * spd(speed) * hurry * smooth(0.35 + t / 0.25);
    const step = Math.min(rem, v * S.dt);
    ch.x += dir * step; ch.y = ch.surface(ch.x);
    ch.phase += step / stridePx * Math.PI;
    walkPose(ch, dir, smooth(t / 0.15) * smooth(rem / (stridePx * 0.5)));
    yield; t += S.dt;
  }
}

function* hopTo(S, ch, x1, speed = 1) {
  const p = () => ch.pose;
  while (Math.abs(x1 - ch.x) > 0.5) {
    const rem = Math.abs(x1 - ch.x), far = 1 + 0.7 * smooth((rem - 220) / 360), sp = spd(speed);   // longer hops while far away
    const dir = Math.sign(x1 - ch.x), len = Math.min(rem, ch.gait.hopLen * ch.k * far * Math.sqrt(sp)), x0 = ch.x;
    const tm = Math.sqrt(sp);   // a hurried hop is both longer and quicker
    yield* during(S, 0.08 / tm, u => { p().sy *= 1 - 0.1 * u; p().sx *= 1 + 0.05 * u; p().faceX += dir * 10; });
    yield* during(S, 0.32 / tm, u => {
      ch.x = x0 + dir * len * u; ch.y = ch.surface(ch.x);
      const q = p(); q.rise += ch.gait.hopH * Math.sin(Math.PI * u); q.legS *= 0.82; q.legL += -dir * 8; q.legR += -dir * 8;
      q.liftL += 28 * Math.sin(Math.PI * u); q.liftR += 28 * Math.sin(Math.PI * u); q.tilt += dir * 6; q.faceX += dir * 10;
      q.sy *= 1 + 0.05 * Math.sin(Math.PI * u);
    });
    ch.x = x0 + dir * len; ch.y = ch.surface(ch.x);
    yield* during(S, 0.1 / tm, u => { p().sy *= 1 - 0.09 * (1 - u); p().sx *= 1 + 0.05 * (1 - u); p().faceX += dir * 10; });
  }
}
const travel = (S, ch, x, speed) => (ch.hop ? hopTo : walkTo)(S, ch, x, speed);

// walk behind `lead`, never closer than `gap` px (two leaving together: the quick one never walks through the other)
function* follow(S, ch, lead, x1, speed, dir, gap) {
  const g = travel(S, ch, x1, speed);
  for (;;) {
    const r = g.next();
    const lim = lead.x - dir * gap;
    if (dir > 0 ? ch.x > lim : ch.x < lim) { ch.x = lim; ch.y = ch.surface(ch.x); }
    if (r.done) return;
    yield;
  }
}

function* idle(S, ch, dur, look = 0) {
  yield* during(S, dur, u => { ch.pose.faceX += look * bell(u, 0.3); });
}
// between two activities: a greeting from afar may start here (the stage pushes it on top), and a character that
// is about to be greeted waits a moment for the other one to finish what it's doing
function* pause(S, ch, dur, look = 0) {
  ch.between = true;
  let t = 0;
  while (t < dur || (S.greetWait(ch) && t < dur + 4)) {
    ch.pose.faceX += look * bell(Math.min(1, t / dur), 0.3);
    yield; t += S.dt;
  }
  ch.between = false;
}

function* changeStance(S, ch, to, dur = 0.3) {
  const from = { sit: ch.sitU, floor: ch.floorU };
  yield* during(S, dur, u => {
    const e = smooth(u);
    ch.sitU = lerp(from.sit, to === 'sit' ? 1 : 0, e); ch.floorU = lerp(from.floor, to === 'floor' ? 1 : 0, e);
    ch.base(); ch.pose.sy *= 1 - 0.06 * Math.sin(Math.PI * u);
  });
  ch.sitU = to === 'sit' ? 1 : 0; ch.floorU = to === 'floor' ? 1 : 0; ch.stance = to;
}

// ---------------------------------------------------------------------------------------------------------------
// Activities: what a character does at a spot. Each is a task; `pl` is the visit's plan (ledge, target…).
const ACTS = {
  *look(S, ch) {
    const a = S.rand() < 0.5 ? -1 : 1;
    yield* during(S, 2.2, u => {
      const p = ch.pose;
      p.faceX += 11 * (u < 0.42 ? a * smooth(u / 0.15) : u < 0.84 ? -a * smooth((u - 0.42) / 0.15) : -a * (1 - smooth((u - 0.84) / 0.16)));
      p.faceY -= 2 * bell(u);
      if (Math.abs(u - 0.42) < 0.03) p.eyes = 'shut';
      p.tilt += a * 2 * Math.sin(u * Math.PI * 2);
    });
  },
  *wave(S, ch, pl) {
    // the arm that shows: never the one behind a card, and over the top of what it peeks from
    const w = ch.waveArm(pl.waveSide || (pl.hidden ? (pl.hidden === 'L' ? 'R' : 'L') : S.rand() < 0.5 ? 'L' : 'R'));
    yield* during(S, 1.5, (u, t) => {
      const e = bell(u, 0.18), p = ch.pose;
      if (w) ch.setLift(w.side, lerp(ch.arm(w.side).rest, w.lift + 18 * Math.sin(t * Math.PI * 2 * 2.6), e));
      else p.rise += 6 * bell(u, 0.3);   // no arm can show: a little bob instead
      p.mouth = mouthOpen(ch);
      p.tilt += (w && w.side === 'L' ? -3 : 3) * e; p.faceY -= 2 * e; p.blush = Math.max(p.blush, 0.3 * e);
    });
  },
  *stretch(S, ch) {
    yield* during(S, 2.1, u => {
      const e = bell(u, 0.3, 0.25), p = ch.pose;
      ch.setLift('L', lerp(ch.arm('L').rest, 168, e)); ch.setLift('R', lerp(ch.arm('R').rest, 168, e));
      p.sy *= 1 + 0.07 * e; p.sx *= 1 - 0.03 * e; p.bodyUp += 3 * e; p.faceY -= 4 * e;
      if (e > 0.6) { if (!ch.traits.openStretch) p.eyes = 'shut'; p.mouth = 'mouth-o'; }
    });
  },
  *hop(S, ch) {
    for (let i = 0; i < 2; i++) {
      yield* during(S, 0.12, u => { ch.pose.sy *= 1 - 0.1 * u; ch.pose.sx *= 1 + 0.05 * u; });
      yield* during(S, 0.4, u => {
        const p = ch.pose; p.rise += 34 * Math.sin(Math.PI * u); p.legS *= 0.85;
        p.liftL += 40 * Math.sin(Math.PI * u); p.liftR += 40 * Math.sin(Math.PI * u);
        if (i === 1) p.eyes = 'shut'; p.mouth = 'mouth-o';
      });
      yield* during(S, 0.14, u => { ch.pose.sy *= 1 - 0.09 * (1 - u); ch.pose.sx *= 1 + 0.05 * (1 - u); });
    }
  },
  *deco(S, ch) {
    // the arm nearest the decoration's outline (a beret's brim, a bow's loop) and the point it would take hold of
    const d = ch.rig.deco, R = ch.rig;
    let best = null;
    for (const side of ['L', 'R']) {
      const a = ch.arm(side), [bx, by] = a.pivot;
      const hx = clamp(bx, d.x + d.w * 0.12, d.x + d.w * 0.88), hy = clamp(by, d.y + d.h * 0.2, d.y + d.h * 0.85);
      const dist = Math.hypot(hx - bx, hy - by);
      if (!best || dist / a.len < best.dist / best.len) best = { side, x: hx, y: hy, dist, len: a.len };
    }
    const tip = best.dist < best.len * 1.1 && (S.rand() < 0.5 || ch.traits.likes?.includes('deco'));
    const nod = !tip && S.rand() < 0.55;
    yield* during(S, 1.8, u => {
      const e = bell(u, 0.25), p = ch.pose;
      if (tip) {   // lift it like a hat
        const { side, x: dx, y: dy } = best, [bx, by] = ch.arm(side).pivot;
        ch.setLift(side, lerp(ch.arm(side).rest, aimLift(ch, side, Math.atan2(dy - by, dx - bx) / DEG), e));
        p.front = true;
        p.decoY += 10 * bell(u, 0.35); p.decoR += (dx < R.gx ? -14 : 14) * bell(u, 0.35);
      } else if (nod) {   // no hand reaches it: a nod that makes it hop
        const n = bell(clamp(u / 0.45, 0, 1), 0.35), h = clamp((u - 0.28) / 0.42, 0, 1);
        p.sy *= 1 - 0.06 * n; p.faceY += 6 * n; p.tilt += 2 * n;
        p.decoY += 20 * Math.sin(Math.PI * h); p.decoR += 9 * Math.sin(Math.PI * 2 * h);
        if (h > 0 && h < 1) p.mouth = 'mouth-o';
      } else {     // a wiggle
        p.decoR += 12 * Math.sin(u * Math.PI * 6) * e;
      }
      p.faceY -= 2 * e; if (e > 0.7 && !nod) p.eyes = 'shut';
    });
  },
  *reveal(S, ch) {
    const R = ch.rig, turn = ch.altHidesFace;   // a back: turn round to it; else the signature shows on the front
    let reach = null;   // the hand that lifts a small secret (摺摺's dog-ear) open
    if (!turn && R.revealAt) for (const side of ['L', 'R']) {
      const a = ch.arm(side), d = Math.hypot(R.revealAt[0] - a.pivot[0], R.revealAt[1] - a.pivot[1]) / a.len;
      if (d < 1.6 && (!reach || d < reach.d)) reach = { side, d };
    }
    yield* during(S, turn ? 3.0 : 2.8, u => {
      const e = bell(u, 0.15), p = ch.pose;
      if (turn) {   // the body narrows to its edge at each swap, like a card turned in the fingers
        const sw = Math.max(bell(clamp((u - 0.04) / 0.16, 0, 1), 0.5), bell(clamp((u - 0.8) / 0.16, 0, 1), 0.5));
        p.sx *= 1 - 0.85 * sw; p.alt = u > 0.12 && u < 0.88;
      } else if (reach) {
        const s = reach.side, [bx, by] = ch.arm(s).pivot, [cx, cy] = R.revealAt;
        const r = smooth(u / 0.16) * (1 - smooth((u - 0.84) / 0.14));
        ch.setLift(s, lerp(ch.arm(s).rest, aimLift(ch, s, Math.atan2(cy - by, cx - bx) / DEG), r));
        p.front = true; p.alt = u > 0.17 && u < 0.83;
        p.faceX += (cx < R.gx ? -7 : 7) * e;   // it looks at its own corner
      } else {
        p.alt = u > 0.12 && u < 0.88;
        ch.setLift('R', lerp(ch.arm('R').rest, 40, e * 0.6));
      }
      p.faceY -= 3 * e; p.faceX += 4 * e * (reach ? 0 : 1);
      p.mouth = u > 0.3 && u < 0.8 ? mouthOpen(ch) : 'mouth';
      p.blush = Math.max(p.blush, 0.5 * e);
    });
  },
  *twinkle(S, ch) {
    let next = 0, lvl = 1;
    yield* during(S, 2.6, (u, t) => {
      if (t >= next) { next = t + 0.16; lvl = 0.3 + 0.7 * S.rand(); }
      const p = ch.pose; p.stars = lvl; p.faceY -= 5 * bell(u); p.faceX += 3 * Math.sin(u * 6);
    });
  },
  *point(S, ch, pl) {
    const [tx, ty] = pl.target;
    const side = pl.hidden === 'L' ? 'R' : pl.hidden === 'R' ? 'L' : tx < ch.x ? 'L' : 'R';
    yield* during(S, 2.4, (u, t) => {
      const e = bell(u, 0.18), p = ch.pose, [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
      const aim = aimLift(ch, side, Math.atan2(ty - by, tx - bx) / DEG);
      ch.setLift(side, lerp(ch.arm(side).rest, aim + 4 * Math.sin(t * 14) * (u > 0.3 ? 1 : 0), e));
      const toward = clamp((tx - ch.x) / (ch.halfW * 2), -1, 1);
      if (u < 0.55) { p.faceX += 10 * toward * e; p.faceY += 3 * e; }
      else { p.mouth = mouthOpen(ch); p.faceY -= 2 * e; }
      p.tilt += (side === 'L' ? -3 : 3) * e;
    });
  },
  *beckon(S, ch, pl) {
    const want = pl.target && pl.target[0] < ch.x ? 'L' : 'R';
    const w = ch.waveArm(want, [120, 150]);
    yield* during(S, 2.6, (u, t) => {
      const e = bell(u, 0.15), p = ch.pose, side = w ? w.side : want;
      if (w) ch.setLift(side, lerp(ch.arm(side).rest, w.lift - 8 + 22 * Math.sin(t * Math.PI * 2 * 2.2), e));
      p.faceX += (u < 0.5 ? 0 : (want === 'L' ? -8 : 8)) * e; p.faceY -= 2 * e;
      p.mouth = mouthOpen(ch);
      p.tilt += (want === 'L' ? -4 : 4) * e;
    });
  },
  *lean(S, ch, pl) {
    const side = pl.target && pl.target[0] < ch.x ? 'L' : 'R', dir = side === 'L' ? -1 : 1;
    const [tx, ty] = pl.target;
    yield* during(S, 3.4, (u, t) => {
      const e = bell(u, 0.15), p = ch.pose, [bx, by] = ch.pagePoint(...ch.arm(side).pivot);
      p.tilt += dir * 9 * e;
      ch.setLift(side, lerp(ch.arm(side).rest, aimLift(ch, side, Math.atan2(ty - by, tx - bx) / DEG), e));
      ch.setLift(side === 'L' ? 'R' : 'L', lerp(ch.arm(side === 'L' ? 'R' : 'L').rest, -18, e));   // a hand on the hip
      if (side === 'R') p.legL -= 12 * e; else p.legR += 12 * e;     // the outer leg crosses
      p.faceX -= dir * 5 * e; p.faceY -= 1 * e;
      if (u > 0.55 && u < 0.62) p.eyes = 'shut';
    });
  },
  *write(S, ch, pl) {
    // writes a little note on a slip of paper (held in one mitten, the pencil in the other), then holds it out
    // toward the button
    const R = ch.rig, toward = pl.target && pl.target[0] < ch.x ? 'L' : 'R', other = toward === 'L' ? 'R' : 'L';
    const paper = S.prop('paper', ch, ch), pencil = S.prop('pencil', ch, ch);
    const [fx, fy] = R.face, hy = lerp(fy, R.tp[1], 0.6), hx = fx + (toward === 'L' ? -34 : 34);
    const ap = ch.arm(toward), aw = ch.arm(other);
    const hold = aimLift(ch, toward, Math.atan2(hy - ap.pivot[1], hx - ap.pivot[0]) / DEG);
    const ha = (toward === 'L' ? 90 + hold : 90 - hold) * DEG, r = ap.len * 0.82;   // where the holding mitten is, rig units
    const px = ap.pivot[0] + Math.cos(ha) * r, py = ap.pivot[1] + Math.sin(ha) * r;
    const pen = aimLift(ch, other, Math.atan2(py - 4 - aw.pivot[1], px - aw.pivot[0]) / DEG);
    const [tx, ty] = pl.target;
    yield* during(S, 3.9, (u, t) => {
      const p = ch.pose;
      const w = smooth(u / 0.12) * (1 - smooth((u - 0.6) / 0.1));      // writing
      const g = smooth((u - 0.62) / 0.14) * (1 - smooth((u - 0.93) / 0.07));   // holding it out
      const [bx, by] = ch.pagePoint(...ap.pivot), give = aimLift(ch, toward, Math.atan2(ty - by, tx - bx) / DEG);
      ch.setLift(toward, lerp(ap.rest, lerp(hold, give, smooth((u - 0.62) / 0.14)), Math.max(w, g)));
      ch.setLift(other, lerp(aw.rest, pen + 6 * Math.sin(t * 21) + 3 * Math.sin(t * 7), w));
      p.front = true;
      p.faceY += 5 * w - 2 * g; p.faceX += (toward === 'L' ? -6 : 6) * Math.max(w, g);
      if (g > 0.4) { p.mouth = mouthOpen(ch); p.blush = Math.max(p.blush, 0.5 * g); }
      const [mx, my, ang] = ch.mitten(toward), fly = smooth((u - 0.84) / 0.16);
      paper.at(lerp(mx, lerp(mx, tx, 0.4), fly), lerp(my - 5 * ch.k, my - 12 * ch.k, fly), ch.k * 2.1,
        smooth(u / 0.08) * (1 - fly), (ang - 90) * 0.12);
      paper.write(clamp((u - 0.1) / 0.48, 0, 1));
      const [qx, qy, qa] = ch.mitten(other);
      pencil.at(qx, qy, ch.k * 1.4, w, (qa - 90) * 0.4 + (other === 'L' ? 25 : -25));
    });
    paper.remove(); pencil.remove();
  },
  *read(S, ch) {
    // reads a little book held in both mittens before its chest, and turns a page
    const R = ch.rig, book = S.prop('book', ch, ch);
    const [fx, fy] = R.face, hy = lerp(fy, R.tp[1], 0.62), size = clamp(R.torso.w * 0.4 / 64, 1.3, 2.1);
    yield* during(S, 3.8 + S.rand(), (u, t) => {
      const e = bell(u, 0.12), p = ch.pose;
      p.faceY += 6 * e; p.faceX += (-6 + 12 * ((t * 0.5) % 1)) * e;   // reading across the page
      for (const side of ['L', 'R']) {
        const a = ch.arm(side), hx = fx + (side === 'L' ? -48 : 48);
        ch.setLift(side, lerp(a.rest, aimLift(ch, side, Math.atan2(hy - a.pivot[1], hx - a.pivot[0]) / DEG), e));
      }
      p.tilt += 1.5 * Math.sin(t * 1.3) * e; p.front = e > 0.02;
      const [lx, ly] = ch.mitten('L'), [rx, ry] = ch.mitten('R');
      book.at((lx + rx) / 2, (ly + ry) / 2 - 3 * ch.k, ch.k * size, smooth((e - 0.45) / 0.3), p.tilt);
      book.turn(clamp((u - 0.55) / 0.12, 0, 1));
      if (u > 0.52 && u < 0.56) p.eyes = 'shut';
    });
    book.remove();
  },
  *swing(S, ch) {
    yield* during(S, 3.2, (u, t) => {
      const e = bell(u, 0.15), p = ch.pose, s = Math.sin(t * Math.PI * 2 * 1.3);
      p.legL += 22 * s * e; p.legR += 22 * Math.sin(t * Math.PI * 2 * 1.3 + 2.2) * e;
      p.bodyUp += 2 * Math.abs(s) * e; p.faceX += 4 * s * e;
      if (u > 0.4 && u < 0.7) p.eyes = 'shut';
    });
  },
  *nap(S, ch, pl) {
    const zs = S.prop('z', ch, ch), lean = pl.target && pl.target[0] < ch.x ? -1 : 1;
    yield* during(S, 5.5 + S.rand() * 1.5, (u, t) => {
      const e = bell(u, 0.12), p = ch.pose, b = Math.sin(t * Math.PI * 2 * 0.32);
      p.eyes = e > 0.6 ? 'nap' : e > 0.15 ? 'sleepy' : p.eyes; p.sy *= 1 + 0.035 * b * e; p.tilt += lean * 7 * e; p.faceY += 4 * e;
      ch.setLift('L', lerp(ch.arm('L').rest, -14, e)); ch.setLift('R', lerp(ch.arm('R').rest, -14, e)); p.front = e > 0.02;
      const [hx, hy] = ch.pagePoint(ch.rig.face[0] + 60 * lean, ch.rig.torso.y - 10);
      const zu = (t * 0.4) % 1;
      zs.at(hx + 10 * lean * zu * ch.k, hy - zu * 50 * ch.k, ch.k * 1.8, e * Math.sin(Math.PI * zu) * 0.95);
    });
    zs.remove();
    yield* ACTS.stretch(S, ch);
  },
  *duck(S, ch, pl) {
    if (pl.how === 'slide') {   // back behind the side for a moment, then out again
      const x1 = ch.x;
      yield* during(S, 0.3, u => { ch.x = lerp(x1, pl.x0, easeOut(u)); });
      yield* during(S, 0.5 + S.rand() * 0.6, () => { ch.x = pl.x0; });
      yield* during(S, 0.35, u => { ch.x = lerp(pl.x0, x1, easeOut(u)); ch.pose.mouth = 'mouth-o'; ch.pose.faceX += (x1 > pl.x0 ? 1 : -1) * 10; });
      ch.x = x1;
      return;
    }
    const deep = (pl.show || 0.6) * ch.rig.height + 30;
    yield* during(S, 0.25, u => { ch.pose.rise -= deep * easeOut(u); });
    yield* during(S, 0.6 + S.rand() * 0.6, () => { ch.pose.rise -= deep; });
    yield* during(S, 0.3, u => { ch.pose.rise -= deep * (1 - easeOut(u)); ch.pose.mouth = 'mouth-o'; ch.pose.liftL += 30 * u; ch.pose.liftR += 30 * u; });
    yield* during(S, 0.5, u => { ch.pose.mouth = 'mouth-o'; ch.pose.liftL += 30 * (1 - u); ch.pose.liftR += 30 * (1 - u); });
  },
};
const ACT_STANCE = {
  stand: ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal', 'twinkle', 'point', 'beckon', 'lean', 'write', 'read'],
  sit: ['read', 'swing', 'look', 'wave', 'reveal', 'deco', 'nap', 'twinkle'],
  floor: ['nap', 'look', 'wave', 'twinkle', 'swing'],
  peek: ['look', 'wave', 'duck', 'point', 'beckon'],
};

// ---------------------------------------------------------------------------------------------------------------
// Entrances and exits, by how the plan reaches its spot: walk (from a side), pop (unfolds up from the page, a
// pop-up book), climb (up from behind an edge's element, onto it), rise (peek over an element's top) or slide (peek
// past an element's side).
function* popUp(S, ch) {
  yield* during(S, 0.42, u => {
    const p = ch.pose, e = u < 0.7 ? 1.07 * easeOut(u / 0.7) : lerp(1.07, 1, smooth((u - 0.7) / 0.3));
    p.popY = Math.max(0.02, e); p.popX = 0.8 + 0.2 * Math.min(1, e);
    if (u < 0.45) p.eyes = 'shut'; else p.mouth = 'mouth-o';
    p.liftL += 34 * (1 - u); p.liftR += 34 * (1 - u);
  });
}
function* popDown(S, ch, speed = 1) {
  yield* during(S, 0.34 / speed, u => {
    const p = ch.pose, e = u < 0.3 ? 1 + 0.05 * Math.sin(Math.PI * u / 0.3) : 1 - easeOut((u - 0.3) / 0.7);
    p.popY = Math.max(0.02, e); p.popX = 0.8 + 0.2 * Math.min(1, e); p.eyes = 'shut';
    p.liftL += 30 * u; p.liftR += 30 * u;
  });
  ch.pose.popY = 0.02;
}

function* enter(S, ch, pl) {
  ch.mode = 'enter';
  if (pl.how === 'walk') {
    ch.x = S.offX(ch, pl.side); ch.y = ch.surface(ch.x);
    yield* travel(S, ch, pl.x, pl.speed || 1);
    if (pl.stance === 'floor') yield* changeStance(S, ch, 'floor', 0.45);
  } else if (pl.how === 'pop') {
    ch.x = pl.x; ch.y = pl.y;
    yield* popUp(S, ch);
    if (pl.stance === 'floor') yield* changeStance(S, ch, 'floor', 0.45);
  } else if (pl.how === 'climb') {
    const r0 = -(ch.rig.height + ch.decoH + 8);
    ch.goBehind(pl.cover, r0);
    yield* during(S, 1.0, (u, t) => {
      const p = ch.pose; p.rise += r0 * (1 - easeOut(u));
      p.legL += 16 * Math.sin(t * 16); p.legR -= 16 * Math.sin(t * 16);
      p.liftL += 50 * (1 - u); p.liftR += 50 * (1 - u); p.faceY -= 4 * (1 - u);
    });
    if (pl.stance === 'sit') {
      yield* during(S, 0.28, u => { ch.pose.rise += 22 * Math.sin(Math.PI * u * 0.5); ch.pose.legS *= 0.85; });
      ch.leaveBehind();
      yield* during(S, 0.22, u => {
        ch.sitU = smooth(u); ch.base(); ch.pose.rise += 22 * (1 - u); ch.pose.sy *= 1 - 0.06 * Math.sin(Math.PI * u);
      });
      ch.sitU = 1; ch.stance = 'sit';
    } else ch.leaveBehind();
  } else if (pl.how === 'rise') {
    const r1 = pl.rise1, r0 = pl.rise0;
    ch.goBehind(pl.cover, r0);
    yield* during(S, 0.9, u => { ch.pose.rise += lerp(r0, r1, easeOut(u)); ch.pose.faceY -= 3 * (1 - u); });
    ch.baseRise = r1;
  } else if (pl.how === 'slide') {
    ch.goBehind(pl.cover, 0);
    const x0 = pl.x0, x1 = pl.x;
    ch.x = x0; ch.y = pl.ground;
    yield* during(S, 0.9, u => {
      ch.x = lerp(x0, x1, easeOut(u)); const dir = Math.sign(x1 - x0);
      ch.pose.tilt += dir * 7 * Math.sin(Math.PI * u * 0.5); ch.pose.faceX += dir * 8; ch.pose.alpha = smooth(u / 0.3);
    });
    ch.x = x1; ch.leanOut = Math.sign(x1 - x0);
  }
  ch.mode = 'act';
}

function* leave(S, ch, pl, speed = 1) {
  ch.mode = 'exit';
  if (pl.how === 'walk' || pl.how === 'line') {
    if (ch.stance !== 'stand') yield* changeStance(S, ch, 'stand', 0.3 / speed);
    const side = S.exitSide(ch, pl);
    if (side) {
      const x1 = S.offX(ch, side);
      yield* travel(S, ch, x1, speed * quick(ch, Math.abs(x1 - ch.x), S.o.walkLimit));
    } else yield* popDown(S, ch, speed);   // someone stands in the way on both sides: fold back into the page
  } else if (pl.how === 'pop') {
    if (ch.stance !== 'stand') yield* changeStance(S, ch, 'stand', 0.3 / speed);
    yield* popDown(S, ch, speed);
  } else if (pl.how === 'climb') {
    if (ch.stance === 'sit') {
      yield* during(S, 0.22 / speed, u => { ch.sitU = 1 - smooth(u); ch.base(); ch.pose.rise += 22 * Math.sin(Math.PI * u * 0.5); });
      ch.sitU = 0; ch.stance = 'stand';
    }
    const r1 = -(ch.rig.height + ch.decoH + 8);
    ch.goBehind(pl.cover, r1);
    yield* during(S, 0.8 / speed, (u, t) => {
      ch.pose.rise += r1 * smooth(u); ch.pose.legL += 14 * Math.sin(t * 16); ch.pose.legR -= 14 * Math.sin(t * 16);
    });
  } else if (pl.how === 'rise') {
    const r0 = pl.rise0;
    yield* during(S, 0.7 / speed, u => { ch.pose.rise += lerp(ch.baseRise, r0, smooth(u)) - ch.baseRise; });
  } else if (pl.how === 'slide') {
    const x0 = ch.x, x1 = pl.x0, dir = Math.sign(x1 - x0);
    yield* during(S, 0.7 / speed, u => {
      ch.x = lerp(x0, x1, smooth(u)); ch.pose.faceX += dir * 8; ch.pose.alpha = 1 - smooth((u - 0.7) / 0.3);
    });
  }
  ch.gone = true;
}

function* shy(S, ch) {
  ch.mode = 'shy';
  yield* during(S, 1.2, u => {
    const e = bell(u, 0.2, 0.1), p = ch.pose;
    for (const side of ['L', 'R']) {
      const [bx, by] = ch.arm(side).pivot, [fx, fy] = ch.rig.face;
      ch.setLift(side, lerp(ch.arm(side).rest, aimLift(ch, side, Math.atan2(fy - 10 - by, fx - bx) / DEG), e));
    }
    p.blush = 1; p.eyes = 'shut'; p.sy *= 1 - 0.04 * e; p.faceY += 3 * e; p.tilt += 3 * Math.sin(u * 20) * e; p.front = e > 0.02;
  });
  ch.blushHold = 1;
}

function* visit(S, ch, pl) {
  yield* enter(S, ch, pl);
  pl.endAt = Math.max(pl.endAt, S.time + S.o.dwell + pl.exitDur);   // a long way in still leaves time to do something
  S.emit('arrive', ch, { label: pl.ledge.label });
  const quiet = () => S.time > pl.endAt - pl.exitDur;
  yield* pause(S, ch, 0.2);
  let n = 0, last = null;
  while (!quiet() || n === 0) {
    const act = S.pickAct(ch, pl, last, n);
    S.emit('act', ch, { act, label: ACT_LABELS[act] || act });
    yield* ACTS[act](S, ch, pl);
    last = act; n++;
    if (quiet()) break;
    yield* pause(S, ch, 0.5 + S.rand() * 0.9, (S.rand() - 0.5) * 8);
  }
  S.emit('leave', ch, {});
  yield* leave(S, ch, pl, 1);
}

// Two characters who can see each other but stand apart (the two ends of the headline, either side of a badge):
// they turn to each other, wave, and the three waves pulse between them — nobody walks. `sh` is shared by the two
// tasks; the left one draws the waves.
function* greetFromAfar(S, ch, other, sh, dir) {
  const lead = dir > 0, w = ch.waveArm(dir > 0 ? 'R' : 'L');
  if (lead) sh.waves = S.prop('waves', ch, ch);
  const dur = 3.1, period = 0.6;
  yield* during(S, dur, (u, t) => {
    const p = ch.pose;
    p.faceX += dir * 11 * smooth(u / 0.08);
    if (u < 0.16) {   // notice: a little hop (the one who saw first), an o
      p.mouth = 'mouth-o'; if (lead) p.rise += 9 * Math.sin(Math.PI * u / 0.16);
      if (u > 0.07 && u < 0.11) p.eyes = 'shut';
    }
    const ew = bell(clamp((u - 0.12) / 0.36, 0, 1), 0.25);   // wave to each other
    if (ew > 0) {
      if (w) ch.setLift(w.side, lerp(ch.arm(w.side).rest, w.lift + 16 * Math.sin(t * 16 + (lead ? 0 : 1)), ew));
      p.mouth = mouthOpen(ch);
    }
    const rt = t - 0.44 * dur, bt = rt / period, ph = ((bt % 1) + 1) % 1, on = rt > 0 && bt < 2;   // resonate: the same bob
    if (on) { p.rise += 7 * Math.sin(Math.PI * ph); if (ph > 0.25 && ph < 0.75) p.eyes = 'shut'; }
    if (rt > 0) p.blush = Math.max(p.blush, 0.8 * smooth(rt / 0.4));
    if (lead && sh.waves) {
      const at = S.wavesBetween(ch, other) || sh.at;
      if (at) { sh.at = at; sh.waves.wave(at[0], at[1], at[2], bell(clamp((u - 0.4) / 0.6, 0, 1), 0.15), on ? ph : 0, 85); }
    }
  });
  if (lead && sh.waves) sh.waves.remove();
  ch.blushHold = 0.6;
}

// The meeting. a is on the left at the end, b on the right; mode 'host' (a guest walks up to someone already there)
// or 'pair' (both walk in from the two sides).
function* duet(S, d) {
  const { a, b } = d, k = (a.k + b.k) / 2;
  const avgW = (a.halfW + b.halfW);   // an average body width, in px
  const roomFor = (ch, other) => ch.halfW + other.halfW;
  // 0 · arrive within sight of each other; they notice each other halfway, and hurry
  const vp = S.vp, inX = (ch, x) => clamp(x, vp.x + ch.halfW + 8, vp.x + vp.w - ch.halfW - 8);
  const seen = { at: null };
  const notice = () => {   // both in view and not far apart: an o, a little hop, quicker steps
    if (seen.at == null && S.inView(a, 0) && S.inView(b, 0) && Math.abs(b.x - a.x) < vp.w * 0.55) seen.at = S.time;
    if (seen.at != null && S.time - seen.at < 0.5) {
      const u = (S.time - seen.at) / 0.5;
      for (const ch of [a, b]) { ch.pose.mouth = 'mouth-o'; ch.pose.rise += 7 * Math.sin(Math.PI * u); }
    }
  };
  const pace = (ch, dist) => { const q = quick(ch, dist, 3.0); return () => q * (seen.at != null ? 1.2 : 1); };
  if (d.mode === 'pair') {
    const va = a.pace(), vb = b.pace(), gap = roomFor(a, b) + 2.2 * avgW;
    const c = clamp(vp.x + vp.w * va / (va + vb), vp.x + gap / 2 + a.halfW + 8, vp.x + vp.w - gap / 2 - b.halfW - 8);
    const xa = inX(a, c - gap / 2), xb = inX(b, c + gap / 2);
    let done = 0;
    yield* all([(function* () { yield* travel(S, a, xa, pace(a, Math.abs(xa - a.x))); done++; })(),
      (function* () { yield* travel(S, b, xb, pace(b, Math.abs(xb - b.x))); done++; })(),
      (function* () { while (done < 2) { notice(); yield; } })()]);
  } else {
    const host = d.host, guest = host === a ? b : a, dir = guest === b ? 1 : -1;
    const stop = inX(guest, host.x + dir * (roomFor(a, b) + 2.2 * avgW));
    let arrived = false;
    yield* all([(function* () { yield* travel(S, guest, stop, pace(guest, Math.abs(stop - guest.x))); arrived = true; })(), (function* () {
      while (!arrived) {   // the host turns toward the guest once the guest is in view
        if (guest.x + guest.halfW > vp.x && guest.x - guest.halfW < vp.x + vp.w) host.pose.faceX += dir * 10;
        notice(); yield;
      }
    })()]);
  }
  d.met = true; a.mode = b.mode = 'duet';
  S.emit('meet', a, { label: `${a.name} 和 ${b.name} 相遇了` });
  // 1 · notice
  yield* during(S, 0.8, u => {
    for (const [ch, dir] of [[a, 1], [b, -1]]) {
      const p = ch.pose; p.faceX += dir * 10; p.mouth = 'mouth-o'; p.rise += 12 * Math.sin(Math.PI * clamp(u / 0.4, 0, 1));
      if (u > 0.6 && u < 0.7) p.eyes = 'shut';
    }
  });
  // 2 · close in, to about half a body apart (room for the three waves between them)
  let variant = d.variant || ['none', 'note', 'five'][Math.floor(S.rand() * 3)];
  const inner = (ch, side) => Math.abs(ch.arm(side).pivot[0] - ch.rig.gx) * ch.k;
  const rA = a.arm('R').len * 0.82 * a.k, rB = b.arm('L').len * 0.82 * b.k;   // brad to mitten centre, px
  const D = roomFor(a, b) + 0.55 * avgW;
  const mid = clamp((a.x + b.x) / 2, vp.x + D / 2 + a.halfW, vp.x + vp.w - D / 2 - b.halfW);
  yield* all([walkTo(S, a, mid - D / 2, 0.8), walkTo(S, b, mid + D / 2, 0.8)]);
  const edges = () => [a.x + (a.rig.torso.x + a.rig.torso.w - a.rig.gx) * a.k, b.x + (b.rig.torso.x - b.rig.gx) * b.k];
  const face = (u = 1) => { a.pose.faceX += 10 * u; b.pose.faceX -= 10 * u; };
  // 3 · wave
  yield* during(S, 1.1, (u, t) => {
    const e = bell(u, 0.2); face();
    a.setLift('R', lerp(a.arm('R').rest, 140 + 16 * Math.sin(t * 17), e));
    b.setLift('L', lerp(b.arm('L').rest, 140 + 16 * Math.sin(t * 17 + 1), e));
    a.pose.mouth = b.pose.mouth = 'mouth-o';
  });
  // 4 · resonate: the same rhythm, three wavy lines between them, a blush
  const beats = 2 + (S.rand() < 0.5 ? 1 : 0), period = 0.62;
  const waves = S.prop('waves', d, a);
  S.emit('act', a, { act: 'resonate', pair: true, label: `${a.name} 和 ${b.name} 一起共振` });
  yield* during(S, beats * period + 0.3, (u, t) => {
    const bt = Math.max(0, t - 0.15) / period, ph = bt % 1, on = t > 0.15 && bt < beats;
    for (const ch of [a, b]) {
      const p = ch.pose;
      if (on) { p.rise += 10 * Math.sin(Math.PI * ph); p.sy *= 1 - 0.05 * (1 - Math.sin(Math.PI * ph)); }
      if (on && ph > 0.2 && ph < 0.8) p.eyes = 'shut';
      p.blush = Math.max(p.blush, smooth(t / period)); p.mouth = 'mouth';
    }
    face();
    const [, ay] = a.facePage(), [, by] = b.facePage(), [ex, fx] = edges();
    const span = (fx - ex) / k * 0.8, s = clamp(span / 85, 0.85, 1.6);
    const [x, y] = S.clearOf((ex + fx) / 2, (ay + by) / 2, 100 * k * s, 44 * k * s) || [(ex + fx) / 2, (ay + by) / 2];
    waves.wave(x, y, k, bell(u, 0.15), on ? ph : 0, span);
  });
  waves.remove();
  for (const ch of [a, b]) ch.blushHold = 0.8;
  // 5 · a note, or a touch of mittens (碰碰手): step in within mitten reach first
  if (variant !== 'none') {   // the inner brads must come within both mittens' reach
    const dy = Math.abs(a.pagePoint(...a.arm('R').pivot)[1] - b.pagePoint(...b.arm('L').pivot)[1]);
    const span = 0.95 * (rA + rB), dx = span > dy ? Math.sqrt(span * span - dy * dy) : -1;
    const D2 = inner(a, 'R') + inner(b, 'L') + dx;
    if (variant === 'five' && D2 < roomFor(a, b)) variant = 'note';   // arms too short for this pair: hand over a note
    const D3 = clamp(D2, roomFor(a, b) + (variant === 'note' ? 0.12 * avgW : 0), D), m2 = (a.x + b.x) / 2;
    if (D3 < D - 2) yield* all([walkTo(S, a, m2 - D3 / 2, 0.6), walkTo(S, b, m2 + D3 / 2, 0.6)]);
  }
  if (variant === 'note') {
    const giver = S.rand() < 0.5 ? a : b, taker = giver === a ? b : a;
    const gs = giver === a ? 'R' : 'L', ts = taker === a ? 'R' : 'L';
    S.emit('act', giver, { act: 'note', label: `遞給 ${taker.name} 一張小紙條` });
    const note = S.prop('note', d, giver);
    const aimAt = (ch, side, other) => {
      const [bx, by] = ch.pagePoint(...ch.arm(side).pivot), [ox, oy] = other.pagePoint(...other.arm(side === 'L' ? 'R' : 'L').pivot);
      return aimLift(ch, side, Math.atan2((oy + by) / 2 - by - 4 * k, ox - bx) / DEG);
    };
    yield* during(S, 2.4, u => {
      face();
      const eg = bell(u, 0.15, 0.3), et = bell((u - 0.2) / 0.8, 0.15, 0.2);
      giver.setLift(gs, lerp(giver.arm(gs).rest, aimAt(giver, gs, taker), eg));
      if (u < 0.75) taker.setLift(ts, lerp(taker.arm(ts).rest, aimAt(taker, ts, giver), et));
      else {   // the taker brings it up to read
        const [bx, by] = taker.arm(ts).pivot, [fx, fy] = taker.rig.face;
        taker.setLift(ts, lerp(taker.arm(ts).rest, aimLift(taker, ts, Math.atan2(fy + 30 - by, fx - bx) / DEG), bell((u - 0.75) / 0.25, 0.3, 0.3) * 0.9 + 0.1));
        taker.pose.faceY += 5; taker.pose.blush = 1; taker.pose.front = true;
      }
      const [gx, gy] = giver.mitten(gs), [tx, ty] = taker.mitten(ts);
      const m = smooth((u - 0.3) / 0.3);
      note.at(lerp(gx, tx, m), lerp(gy, ty, m) - 10 * k * Math.sin(Math.PI * m), k, smooth(u / 0.15) * (1 - smooth((u - 0.92) / 0.08)), 0);
      if (u > 0.55) taker.pose.mouth = 'mouth-o';
    });
    note.remove();
  } else if (variant === 'five') {
    S.emit('act', a, { act: 'five', pair: true, label: `${a.name} 和 ${b.name} 碰碰手` });
    const burst = S.prop('burst', d, a);
    yield* during(S, 1.4, u => {
      face();
      // where the mittens meet: between the brads (nearer the shorter arm), raised as high as both arms allow
      const [abx, aby] = a.pagePoint(...a.arm('R').pivot), [bbx, bby] = b.pagePoint(...b.arm('L').pivot);
      const f = rA / (rA + rB), cx = lerp(abx, bbx, f), cy = lerp(aby, bby, f);
      const up = 0.85 * Math.sqrt(Math.max(0, Math.min(rA * rA - (cx - abx) ** 2 - (cy - aby) ** 2, rB * rB - (cx - bbx) ** 2 - (cy - bby) ** 2)));
      const mx = cx, my = cy - up;
      const e = bell(u, 0.3, 0.3);
      a.setLift('R', lerp(a.arm('R').rest, aimLift(a, 'R', Math.atan2(my - aby, mx - abx) / DEG), e));
      b.setLift('L', lerp(b.arm('L').rest, aimLift(b, 'L', Math.atan2(my - bby, mx - bbx) / DEG), e));
      const touch = bell((u - 0.36) / 0.34, 0.2, 0.5);
      a.pose.tilt += 5 * touch; b.pose.tilt -= 5 * touch;
      // at the touch both hop together, eyes shut, and the burst flashes in the ink that reads on that background
      const hop = Math.sin(Math.PI * clamp((u - 0.4) / 0.32, 0, 1)) * 16;
      a.pose.rise += hop; b.pose.rise += hop;
      if (touch > 0.3) { a.pose.eyes = b.pose.eyes = 'shut'; a.pose.mouth = b.pose.mouth = 'mouth-o'; }
      burst.at(mx, my - hop * k, k * 1.35, touch, 0);
    });
    burst.remove();
  }
  yield* during(S, 0.4, () => face(0.6));
  // 6 · part: each its own way, or together (at the slower one's pace, the follower never closer than a step)
  for (const ch of [a, b]) ch.mode = 'exit';
  d.together = d.together ?? S.rand() < 0.4;
  S.emit('leave', a, { pair: true, label: `${a.name} 和 ${b.name}${d.together ? ' 一起離開' : ' 各走各的路'}` });
  const clearL = S.pathClear(a, a.x, S.offX(a, 'left')) && S.pathClear(b, b.x, S.offX(b, 'left'));
  const clearR = S.pathClear(a, a.x, S.offX(a, 'right')) && S.pathClear(b, b.x, S.offX(b, 'right'));
  if (d.together && !clearL && !clearR) d.together = false;
  if (d.together) {
    const right = clearL && clearR ? (a.x + b.x) / 2 > S.vp.x + S.vp.w / 2 : clearR, dir = right ? 1 : -1;
    const lead = right ? b : a, foll = right ? a : b, gap = a.halfW + b.halfW + 12;
    const end = S.offX(foll, right ? 'right' : 'left'), v = Math.min(a.pace(), b.pace());
    const q = quick(lead, Math.abs(end - lead.x), S.o.walkLimit + 0.6);
    yield* all([travel(S, lead, end + dir * gap, q * v / lead.pace()),
      (function* () { yield* during(S, 0.25); yield* follow(S, foll, lead, end, q * v / foll.pace(), dir, gap); })()]);
  } else {
    const L = S.offX(a, 'left'), R = S.offX(b, 'right');
    const go = (ch, x) => S.pathClear(ch, ch.x, x) ? travel(S, ch, x, quick(ch, Math.abs(x - ch.x), S.o.walkLimit)) : popDown(S, ch);
    yield* all([go(a, L), go(b, R)]);
  }
  a.gone = b.gone = true;
}

// ---------------------------------------------------------------------------------------------------------------
class Puppet {
  constructor(S, entry, slot) {
    this.S = S; this.entry = entry; this.slug = entry.slug; this.m = entry.manifest; this.slot = slot;
    this.name = this.m.name || entry.slug;
    this.rig = rigInfo(this.m);
    this.traits = entry.traits || {};
    const R = this.rig;
    this.hop = this.m.walk === 'hop';
    this.scaleBy();
    this.gait = {
      speed: (240 + R.legLen * 1.5) * (this.traits.pace || 1), stride: Math.max(44, R.legLen * 1.05),
      swing: this.traits.shuffle ? 14 : 24, arm: 10, hopLen: (R.box.r - R.box.l) * 0.62, hopH: 44,
    };
    this.decoH = Math.max(0, R.torso.y - Math.min(...this.m.parts.filter(p => p.parent === 'body' && p.w && !p.variantOf).map(p => p.y)));
    this.altHidesFace = (R.hides.get('torso-alt') || []).includes('face');
    this.x = 0; this.y = 0; this.stance = 'stand'; this.sitU = 0; this.floorU = 0; this.baseRise = 0;
    this.surface = () => this.y;
    this.tasks = []; this.fx = []; this.face = { x: 0, y: 0 }; this.phase = 0; this.mode = 'enter'; this.between = false;
    this.blinkAt = S.time + 1 + S.rand() * 3; this.blinkUntil = 0; this.clicks = 0; this.greetedAt = -9;
    this.hover = null; this.release = null; this.cover = null; this.blushHold = 0; this.leanOut = 0; this.gone = false; this.drawn = false;
    this.css = new Map();
    this.build(); this.layout(); this.base();
  }
  // a character's height on the stage: unitHeight × (its height / 420) ^ heightCurve, so the tallest is a little
  // less tall and the smallest a little less small than a straight scale would make them
  scaleBy() { this.kMul = (this.rig.height / 420) ** ((this.S.o.heightCurve ?? 1) - 1); }
  get k() { return this.S.k * this.kMul; }
  get halfW() { return Math.max(-this.rig.box.l, this.rig.box.r) * this.k * 0.9; }
  get h() { return (-this.rig.box.t) * this.k; }
  halfWFor(stance) {
    const R = this.rig;
    return stance === 'floor' ? Math.max(R.floorHalf, R.torsoHalf) * this.k : stance === 'sit' ? Math.max(R.torsoHalf, R.hipX + 30) * this.k : this.halfW;
  }
  arm(side) { return this.rig.arms[side]; }
  pace() {   // px per second along the ground, walking or hopping
    return this.hop ? this.gait.hopLen * this.k / 0.5 : this.gait.speed * this.k;
  }
  setLift(side, v) { if (side === 'L') this.pose.liftL = v; else this.pose.liftR = v; }

  build() {
    const doc = this.S.doc, base = this.entry.base, mk = tag => doc.createElement(tag);
    const el = mk('div'); el.className = 'ms-char'; el.style.zIndex = String(10 + this.slot * 3);
    const body = mk('div'), face = mk('div'); body.className = 'ms-body'; face.className = 'ms-face';
    this.img = {};
    const parts = this.m.parts.filter(p => p.w).sort((a, b) => a.z - b.z);
    const img = p => {
      const im = mk('img'); im.src = base + p.img; im.alt = ''; im.draggable = false; im.decoding = 'async';
      if (p.only === 'dark') im.className = 'ms-glow';   // night-only light (stars-glow) is never dimmed
      this.img[p.name] = im; return im;
    };
    const faceZ = Math.min(...parts.filter(p => p.parent === 'face').map(p => p.z));
    const bodyZ = Math.min(...parts.filter(p => p.parent !== 'root').map(p => p.z));
    let faceIn = false;
    for (const p of parts) {
      if (p.parent === 'face') { face.append(img(p)); continue; }
      if (p.parent === 'body') {
        if (!faceIn && p.z > faceZ) { body.append(face); faceIn = true; }
        body.append(img(p)); continue;
      }
      if (p.z > bodyZ && !body.parentNode) el.append(body);
      el.append(img(p));
    }
    if (!faceIn) body.append(face);
    if (!body.parentNode) el.append(body);
    this.blushEl = [mk('i'), mk('i')]; for (const b of this.blushEl) { b.className = 'ms-blush'; face.append(b); }
    // the only thing that takes the pointer: an invisible shape over the torso (never the arms, legs or decoration,
    // whose transparent corners would cover the buttons beside them)
    this.hitEl = mk('i'); this.hitEl.className = 'ms-hit'; body.append(this.hitEl);
    // arms painted behind the torso (tucked under its edge) come to the front, one at a time, once a pose turns them
    // across the body (mittens over the face, holding a book, reading a note): remember where they live
    const torsoZ = this.m.parts.find(p => p.name === 'torso').z;
    const behind = ['L', 'R'].map(sd => this.rig.arms[sd]).filter(a => a.part.z < torsoZ);
    this.armsBehind = behind.map(a => {
      let next = this.img[a.name].nextSibling;
      while (next && behind.some(b => this.img[b.name] === next)) next = next.nextSibling;
      return { side: a.side, img: this.img[a.name], next, front: false };
    });
    this.variants = {};   // base part → [base, …its variants]
    for (const base of ['eye-l', 'eye-r', 'mouth', 'torso']) this.variants[base] = [base, ...this.m.parts.filter(p => p.variantOf === base && p.w).map(p => p.name)];
    this.variantNames = new Set(Object.values(this.variants).flat());
    this.hideable = new Set([...this.rig.hides.values()].flat());   // what any variant can hide (`face`: the face group)
    this.el = el; this.bodyEl = body; this.faceEl = face;
    el.addEventListener('pointerenter', e => this.onEnter(e));
    el.addEventListener('pointermove', e => this.onMove(e));
    el.addEventListener('pointerleave', () => { this.hover = null; });
    el.addEventListener('click', e => this.onClick(e));
    this.S.root.append(el);
  }

  layout() {
    const k = this.k, { gx, gy, tp } = this.rig, px = v => `${(v * k).toFixed(2)}px`;
    for (const p of this.m.parts) {
      const im = this.img[p.name]; if (!im) continue;
      const s = im.style;
      s.left = px(p.x - gx); s.top = px(p.y - gy); s.width = px(p.w); s.height = px(p.h);
      s.transformOrigin = `${px(p.pivot[0] - p.x)} ${px(p.pivot[1] - p.y)}`;
    }
    const t = this.rig.torso, hs = this.hitEl.style;
    hs.left = px(t.x - gx); hs.top = px(t.y - gy); hs.width = px(t.w); hs.height = px(t.h);
    hs.clipPath = t.hit && t.hit.length > 2 ? `polygon(${t.hit.map(([x, y]) => `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`).join(',')})` : 'ellipse(45% 45% at 50% 52%)';
    this.bodyEl.style.transformOrigin = `${px(tp[0] - gx)} ${px(tp[1] - gy)}`;
    const [[lx, ly], [rx, ry]] = this.rig.eyes, w = 30, h = 15;
    for (const [b, x, y] of [[this.blushEl[0], lx - 10, ly + 26], [this.blushEl[1], rx + 10, ry + 26]]) {
      b.style.left = px(x - gx - w / 2); b.style.top = px(y - gy - h / 2); b.style.width = px(w); b.style.height = px(h);
    }
    this.css.clear(); this.drawn = false;
  }

  // the stance's baseline pose: standing, sitting on an edge (legs over its front) or sitting on the floor
  base() {
    const R = this.rig, sit = this.sitU, flo = this.floorU;
    const seat = -(R.gy - R.tp[1] + 3), floor = -(R.gy - R.tp[1]) + 4;
    this.pose = {
      rise: this.baseRise + sit * seat + flo * floor, bodyUp: 0, tilt: 0, sx: 1, sy: 1,
      legL: 7 * sit + R.floorAng * flo, legR: -7 * sit - R.floorAng * flo, legS: 1 - 0.14 * sit - R.floorS * flo,
      liftL: R.arms.L.rest, liftR: R.arms.R.rest, faceX: 0, faceY: 0, eyes: 'open', mouth: 'mouth', alt: false,
      decoR: 0, decoY: 0, blush: 0, stars: 1, alpha: 1, shadow: 1 - 0.4 * sit + 0.15 * flo, front: false, popX: 1, popY: 1,
    };
    this.pose.ground = this.pose.rise;
  }

  push(task) { this.tasks.push(task); }
  run() {
    for (let i = 0; i < 4 && this.tasks.length; i++) {
      if (!this.tasks[this.tasks.length - 1].next().done) return;
      this.tasks.pop();
    }
  }

  // after the task: blinks, breathing, the face easing toward where it looks, the visitor's pointer, click hops
  overlay(dt) {
    const S = this.S, p = this.pose;
    if (!S.reduced) {
      if (S.time >= this.blinkAt) { this.blinkUntil = S.time + 0.13; this.blinkAt = S.time + 2.5 + S.rand() * 3.5; }
      if (S.time < this.blinkUntil) p.eyes = 'shut';
      if (this.mode !== 'enter' && this.mode !== 'exit') p.sy *= 1 + 0.012 * Math.sin(S.time * 2.1 + this.slot);
      if (this.hover && this.mode !== 'exit') { p.faceX = this.hover.fx; p.faceY = this.hover.fy; }
      for (const f of this.fx) f.fn(clamp((S.time - f.t0) / f.dur, 0, 1));
      this.fx = this.fx.filter(f => S.time - f.t0 < f.dur);
      if (this.rig.has('stars') && p.stars === 1) p.stars = 0.8 + 0.2 * Math.sin(S.time * 2.7 + this.slot * 2);
    }
    if (this.blushHold > 0) { p.blush = Math.max(p.blush, this.blushHold); this.blushHold = Math.max(0, this.blushHold - dt * 0.35); }
    const ease = 1 - Math.exp(-dt * 16);
    this.face.x += (clamp(p.faceX, -12, 12) - this.face.x) * ease;
    this.face.y += (clamp(p.faceY, -8, 8) - this.face.y) * ease;
  }

  // full: the pose too (12 times a second in the stepped mode); otherwise only where the character is
  render(full = true) {
    const k = this.k, p = this.pose, R = this.rig, S = this.S;
    if (!this.drawn) full = true;
    const set = (name, key, v) => {
      const el = name === 'root' ? this.el : name === 'body' ? this.bodyEl : name === 'face' ? this.faceEl : name === 'hit' ? this.hitEl
        : name === 'b0' ? this.blushEl[0] : name === 'b1' ? this.blushEl[1] : this.img[name];
      const id = name + '.' + key;
      if (this.css.get(id) !== v) { this.css.set(id, v); el.style[key] = v; }
    };
    const f = v => v.toFixed(2);
    const pop = p.popX !== 1 || p.popY !== 1 ? ` scale(${p.popX.toFixed(3)},${p.popY.toFixed(3)})` : '';
    set('root', 'transform', `translate3d(${f(this.x)}px,${f(this.y - p.rise * k)}px,0)${pop}`);
    set('root', 'opacity', p.alpha >= 1 ? '' : f(Math.max(0, p.alpha)));
    if (this.cover && !S.env.behind) set('root', 'clipPath', this.clipPolygon());
    else set('root', 'clipPath', '');
    set('hit', 'pointerEvents', this.takesPointer() ? '' : 'none');
    if (!full) return;
    this.drawn = true;
    const air = Math.max(0, p.rise - p.ground), sh = this.cover || this.noShadow ? 0 : p.shadow * (1 - clamp(air / R.height, 0, 0.55));
    set('shadow', 'transform', `translate(0,${f(p.rise * k)}px) scale(${f(sh)})`);
    set('body', 'transform', `translate(0,${f(-p.bodyUp * k)}px) rotate(${f(p.tilt)}deg) scale(${f(p.sx)},${f(p.sy)})`);
    set('face', 'transform', `translate(${f(this.face.x * k)}px,${f(this.face.y * k)}px)`);
    set('leg-l', 'transform', `rotate(${f(p.legL)}deg) scale(1,${f(p.legS)})`);
    set('leg-r', 'transform', `rotate(${f(p.legR)}deg) scale(1,${f(p.legS)})`);
    for (const side of ['L', 'R']) {
      const a = R.arms[side], lift = side === 'L' ? p.liftL : p.liftR;
      set(a.name, 'transform', `rotate(${f((side === 'L' ? 90 + lift : 90 - lift) - a.theta)}deg)`);
    }
    if (this.img.deco) set('deco', 'transform', `translate(0,${f(-p.decoY * k)}px) rotate(${f(p.decoR)}deg)`);
    if (this.img['deco-back']) set('deco-back', 'transform', `translate(0,${f(-p.decoY * k)}px) rotate(${f(p.decoR)}deg)`);
    const vis = (name, on) => { if (this.img[name]) set(name, 'visibility', on ? '' : 'hidden'); };
    const shown = [];
    // variants: eyes 'open' | 'shut' | any other variant the rig has (eye-l-nap…, falling back to shut);
    // mouth 'mouth' | 'mouth-o' | 'mouth-open' (falling back to mouth-o); torso-alt for the reveal
    for (const side of ['l', 'r']) {
      const base = `eye-${side}`, want = p.eyes === 'open' ? base : this.img[`${base}-${p.eyes}`] ? `${base}-${p.eyes}` : this.img[`${base}-shut`] ? `${base}-shut` : base;
      for (const v of this.variants[base]) vis(v, v === want);
      shown.push(want);
    }
    const mouth = this.img[p.mouth] ? p.mouth : p.mouth === 'mouth-open' && this.img['mouth-o'] ? 'mouth-o' : 'mouth';
    for (const v of this.variants.mouth) vis(v, v === mouth);
    shown.push(mouth);
    // an arm tucked behind the torso comes to the front once the pose has turned it away from rest (so the strip
    // between its brad and the paper's edge never pops onto the sheet while it still hangs down)
    for (const a of this.armsBehind) {
      const lift = a.side === 'L' ? p.liftL : p.liftR, want = p.front && Math.abs(lift - R.arms[a.side].rest) > 14;
      if (want !== a.front) { a.front = want; if (want) this.bodyEl.append(a.img); else this.bodyEl.insertBefore(a.img, a.next); }
    }
    const torso = p.alt && this.img['torso-alt'] ? 'torso-alt' : 'torso';
    for (const v of this.variants.torso) vis(v, v === torso);
    shown.push(torso);
    for (const part of this.m.parts) if (part.only) vis(part.name, part.only === S.theme);
    // a variant that shows can hide other parts (the tag's back hides its face: `hides="face"`)
    if (this.hideable.size) {
      const off = new Set();
      for (const name of shown) for (const h of R.hides.get(name) || []) off.add(h);
      for (const name of this.hideable) {
        if (name === 'face') set('face', 'visibility', off.has('face') ? 'hidden' : '');
        else if (off.has(name)) vis(name, false);
        else if (!this.variantNames.has(name) && !R.parts.get(name)?.only) vis(name, true);
      }
    }
    if (this.img.stars) set('stars', 'opacity', f(p.stars));
    if (this.img['stars-glow'] && S.theme === 'dark') set('stars-glow', 'opacity', f(p.stars));
    const b = f(clamp(p.blush, 0, 1) * 0.85);
    set('b0', 'opacity', b); set('b1', 'opacity', b);
  }

  // the pointer: never in reduced motion (nothing would answer), never while the torso overlaps a button or words
  // (its spot's clear rects, the page's content: a lean, a tilt, walking past)
  takesPointer() {
    if (this.S.reduced || this.still || this.gone) return false;
    const own = this.plan && this.plan.ledge.clear, page = this.S.content();
    if (!(own && own.length) && !page.length) return true;
    const t = this.rig.torso, pts = [[t.x, t.y], [t.x + t.w, t.y], [t.x, t.y + t.h], [t.x + t.w, t.y + t.h]].map(q => this.pagePoint(...q));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), m = 0.06;
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const box = { x: Math.min(...xs) + w * m, y: Math.min(...ys) + h * m, w: w * (1 - 2 * m), h: h * (1 - 2 * m) };
    return !(own && own.some(r => r && hit(box, r, 2))) && !page.some(r => r && hit(box, r, 2));
  }

  // a rig point (units, on the body) → page px, through the frame's pose
  pagePoint(ux, uy) {
    const R = this.rig, p = this.pose, k = this.k, c = Math.cos(p.tilt * DEG), s = Math.sin(p.tilt * DEG);
    const lx = (ux - R.tp[0]) * p.sx, ly = (uy - R.tp[1]) * p.sy;
    return [this.x + (R.tp[0] - R.gx + lx * c - ly * s) * k, this.y + (R.tp[1] - R.gy - p.bodyUp + lx * s + ly * c - p.rise) * k];
  }
  facePage() { return this.pagePoint(this.rig.face[0] + this.face.x, this.rig.face[1] + this.face.y); }
  mitten(side) {
    const a = this.arm(side), lift = side === 'L' ? this.pose.liftL : this.pose.liftR;
    const ang = (side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt;
    const [bx, by] = this.pagePoint(...a.pivot), r = a.len * 0.82 * this.k;
    return [bx + Math.cos(ang * DEG) * r, by + Math.sin(ang * DEG) * r, ang];
  }
  // would this arm's mitten show at this lift? Not behind the card it peeks past, and over the top of what it peeks
  // from (a mitten raised high enough to clear the edge)
  armShows(side, lift) {
    const pl = this.plan;
    if (!pl) return true;
    if (pl.how === 'slide') return pl.hidden !== side;
    if (pl.how !== 'rise' || !this.cover) return true;
    const a = this.arm(side), ang = ((side === 'L' ? 90 + lift : 90 - lift) + this.pose.tilt) * DEG;
    const [bx, by] = this.pagePoint(...a.pivot), r = a.len * 0.82 * this.k;
    const mx = bx + Math.cos(ang) * r, my = by + Math.sin(ang) * r - a.len * 0.12 * this.k;
    const c = this.cover, top = c.top && c.top.length ? pathY(c.top, mx) : c.y;
    return my < top - 3;
  }
  // the arm (and how high) a wave or a beckon uses: `want` if it shows, else the other one, else null
  waveArm(want, lifts = [145, 168]) {
    const other = want === 'L' ? 'R' : 'L';
    for (const lift of lifts) for (const side of [want, other]) if (this.armShows(side, lift)) return { side, lift };
    return null;
  }

  goBehind(cover, lowestRise) {
    this.leaveBehind();
    const feet = this.y - lowestRise * this.k;
    const c = { ...cover, depth: Math.max(0, feet - (cover.y + cover.h) + 4) };
    this.cover = c;
    if (this.S.env.behind) this.release = this.S.env.behind(this.el, c);
  }
  leaveBehind() { if (this.release) this.release(); this.release = null; this.cover = null; }
  clipPolygon() {   // the built-in "behind": everything inside the element's outline (and the slot below it) is cut
    const c = this.cover, ox = this.x, oy = this.y - this.pose.rise * this.k, f = v => `${v.toFixed(1)}px`;
    let top = c.top && c.top.length ? c.top : [[c.x, c.y], [c.x + c.w, c.y]];
    if (!(c.top && c.top.length) && c.radius) {   // rounded top corners
      const r = Math.min(c.radius, c.w / 2, c.h / 2), arc = (cx, a0) => [0, 1, 2, 3, 4].map(i => { const a = (a0 + i * 22.5) * DEG; return [cx + Math.cos(a) * r, c.y + r + Math.sin(a) * r]; });
      top = [...arc(c.x + r, 180), ...arc(c.x + c.w - r, 270)];
    }
    const bottom = c.y + c.h + c.depth;
    const hole = [[c.x, top[0][1]], ...top, [c.x + c.w, top[top.length - 1][1]], [c.x + c.w, bottom], [c.x, bottom]]
      .map(([x, y]) => `${f(x - ox)} ${f(y - oy)}`);
    return `polygon(evenodd, -4000px -4000px, 4000px -4000px, 4000px 4000px, -4000px 4000px, -4000px -4000px, ${hole.join(', ')}, ${f(c.x - ox)} ${f(top[0][1] - oy)})`;
  }

  // the visitor
  onEnter(e) {
    const S = this.S;
    if (S.reduced || e.pointerType === 'touch') return;
    this.onMove(e);
    if (this.mode === 'act' && S.time - this.greetedAt > 4 && !this.duet) {
      this.greetedAt = S.time;
      const side = this.hover && this.hover.fx < 0 ? 'L' : 'R';
      this.push(ACTS.wave(S, this, { ...this.plan, waveSide: side }));
      S.emit('act', this, { act: 'wave', label: '看到你了，揮揮手' });
    }
  }
  onMove(e) {
    if (this.S.reduced || e.pointerType === 'touch') return;
    const a = this.img['eye-l'].getBoundingClientRect(), b = this.img['eye-r'].getBoundingClientRect();
    const t = this.img.torso.getBoundingClientRect(), unit = t.height / this.rig.torso.h || 1;
    const dx = (e.clientX - (a.left + b.right) / 2) / unit, dy = (e.clientY - (a.top + b.bottom) / 2) / unit;
    this.hover = { fx: clamp(dx / 5, -11, 11), fy: clamp(dy / 7, -6, 6) };
  }
  onClick(e) {
    const S = this.S;
    e.stopPropagation();
    if (S.reduced || this.mode === 'exit' || this.mode === 'shy') return;
    this.clicks++;
    if (this.clicks === 1) {
      this.fx.push({ t0: S.time, dur: 0.6, fn: u => {
        const p = this.pose;
        p.rise += 30 * Math.sin(Math.PI * clamp((u - 0.15) / 0.85, 0, 1));
        p.sy *= u < 0.15 ? 1 - 0.1 * u / 0.15 : 1 + 0.04 * Math.sin(Math.PI * u);
        p.eyes = 'shut'; p.mouth = mouthOpen(this); p.blush = Math.max(p.blush, 0.5);
      } });
      S.emit('act', this, { act: 'hop', label: '被你戳了一下，開心跳起來' });
    } else {
      S.emit('act', this, { act: 'shy', label: '害羞了，先走囉' });
      S.leaveSoon(this, { shy: true });
    }
  }

  destroy() { this.leaveBehind(); this.S.dropProps(this); this.el.remove(); }
}

// ---------------------------------------------------------------------------------------------------------------
// Props: small pencil drawings the engine adds (no filters): the three resonance waves, a folded note, a touch
// burst, a pencil, a slip of paper, a little book, sleepy z's. Sized in rig units (k = px per unit). Each takes the
// pencil that reads on its owner's background (the ledge's `ink`), and moves with the poses (12 times a second).
const PROP_SVG = {
  waves: '<svg viewBox="0 0 100 44" width="100" height="44"><g fill="none" stroke="currentColor" stroke-width="5.6" stroke-linecap="round">'
    + [8, 22, 36].map((y, i) => `<path class="w${i}" d="M4 ${y} q12 -9 23 0 t23 0 t23 0 t23 0"/>`).join('') + '</g></svg>',
  note: '<svg viewBox="0 0 44 34" width="44" height="34"><path d="M3 5 L41 3 L40 30 L4 31 Z" fill="oklch(95% 0.025 86)" stroke="currentColor" stroke-width="1.6"/>'
    + '<path d="M3 5 L22 18 L41 3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="22" cy="22" r="3.2" fill="oklch(62% 0.14 45)"/></svg>',
  burst: '<svg viewBox="0 0 60 60" width="60" height="60"><g stroke="currentColor" stroke-width="3.4" stroke-linecap="round">'
    + '<path d="M30 14 L30 3"/><path d="M42 18 L51 9"/><path d="M18 18 L9 9"/><path d="M46 30 L57 30"/><path d="M14 30 L3 30"/></g></svg>',
  pencil: '<svg viewBox="0 0 12 56" width="12" height="56"><path d="M3 8 L9 8 L9 46 L6 54 L3 46 Z" fill="oklch(72% 0.09 70)" stroke="currentColor" stroke-width="1.2"/>'
    + '<path d="M3 46 L9 46 L6 54 Z" fill="oklch(92% 0.03 80)" stroke="currentColor" stroke-width="1"/><rect x="3" y="2" width="6" height="6" fill="oklch(62% 0.14 45)"/></svg>',
  paper: '<svg viewBox="0 0 40 30" width="40" height="30"><path d="M3 3 L37 2 L38 27 L2 28 Z" fill="oklch(97% 0.015 86)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">'
    + ['M8 10 q4 -3 7 0 t7 0 t7 0', 'M8 16 q4 -3 7 0 t7 0 t9 0', 'M8 22 q4 -3 7 0 t6 0'].map(d => `<path class="s" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" d="${d}"/>`).join('')
    + '</g></svg>',
  book: '<svg viewBox="0 0 64 42" width="64" height="42"><path d="M2 9 L2 39 C12 36 24 36 32 40 C40 36 52 36 62 39 L62 9 Z" fill="oklch(60% 0.11 45)"/>'
    + '<path d="M32 8 C24 4 12 4 4 7 L4 35 C12 32 24 32 32 36 C40 32 52 32 60 35 L60 7 C52 4 40 4 32 8 Z" fill="oklch(96% 0.02 86)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M32 8 L32 36" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M9 14 h17 M9 20 h15 M9 26 h17 M38 14 h17 M38 20 h13 M38 26 h16" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".5"/>'
    + '<path class="pg" d="M32 8 C40 4 52 4 60 7 L60 35 C52 32 40 32 32 36 Z" fill="oklch(93% 0.025 86)" stroke="currentColor" stroke-width="1.6" opacity="0"/></svg>',
  z: '<svg viewBox="0 0 40 40" width="40" height="40"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 20 L16 20 L4 32 L16 32"/><path d="M22 4 L32 4 L22 14 L32 14"/></g></svg>',
};
class Prop {
  constructor(S, kind, owner, inkFrom) {
    this.S = S; this.kind = kind; this.owner = owner;
    const el = S.doc.createElement('div'); el.className = 'ms-prop'; el.innerHTML = PROP_SVG[kind];
    el.style.color = `var(--ms-ink-${S.inkOf(inkFrom)})`;
    this.svg = el.firstChild; this.el = el; el.style.opacity = '0'; S.root.append(el);
    this.lines = kind === 'waves' ? [...el.querySelectorAll('path')] : kind === 'paper' ? [...el.querySelectorAll('path.s')] : [];
    this.page = kind === 'book' ? el.querySelector('path.pg') : null;
    this.q = {};   // what to draw at the next pose step
  }
  at(x, y, k, alpha, rot = 0) {   // centre at page (x, y)
    const w = this.svg.width.baseVal.value, h = this.svg.height.baseVal.value;
    this.q.tf = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${k.toFixed(3)}) translate(${-w / 2}px,${-h / 2}px)`;
    this.q.op = clamp(alpha, 0, 1).toFixed(2);
  }
  wave(x, y, k, alpha, ph, span) {   // the three lines pulse one after another on each beat
    const s = clamp(span / 85, 0.85, 1.6);
    this.at(x, y, k * s, alpha);
    this.q.lines = this.lines.map((l, i) => {
      const u = clamp(ph * 1.3 - i * 0.15, 0, 1), v = Math.sin(Math.PI * u);
      return [(0.5 + 0.5 * v).toFixed(2), `translate(${(50 * (1 - (0.8 + 0.25 * v))).toFixed(1)}px,0) scale(${(0.8 + 0.25 * v).toFixed(3)},1)`];
    });
  }
  write(u) { this.q.ink = u; }      // the paper's lines appear as they are written
  turn(u) { this.q.page = u; }      // the book's page turns over
  flush() {
    const q = this.q, st = this.el.style;
    if (q.tf != null && q.tf !== this.tf) { st.transform = this.tf = q.tf; }
    if (q.op != null && q.op !== this.op) { st.opacity = this.op = q.op; }
    if (q.lines) q.lines.forEach(([o, t], i) => { this.lines[i].style.opacity = o; this.lines[i].style.transform = t; });
    if (q.ink != null) this.lines.forEach((l, i) => { l.style.strokeDashoffset = (1 - clamp(q.ink * 3 - i, 0, 1)).toFixed(3); });
    if (q.page != null && this.page) {
      const u = q.page, on = u > 0 && u < 1;
      this.page.style.opacity = on ? '1' : '0';
      this.page.style.transform = `scale(${(1 - 2 * smooth(u)).toFixed(3)},1)`;
    }
    this.q = {};
  }
  remove() { this.el.remove(); this.S.props.delete(this); }
}

// ---------------------------------------------------------------------------------------------------------------
const STYLE = `
.ms-stage{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:clip;contain:layout style;
  --ms-ink-dark:oklch(32% 0.02 60);--ms-ink-light:oklch(93% 0.02 80)}
.ms-char{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
.ms-char img{position:absolute;display:block;max-width:none;margin:0;padding:0;border:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
.ms-char .ms-hit{position:absolute;display:block;pointer-events:auto;cursor:default;background:transparent;-webkit-tap-highlight-color:transparent}
.ms-body,.ms-face{position:absolute;left:0;top:0;width:0;height:0}
.ms-blush{position:absolute;display:block;opacity:0;border-radius:50%;background:radial-gradient(closest-side,oklch(66% 0.13 40/.75),oklch(66% 0.13 40/0))}
.ms-stage.ms-dim .ms-char img{filter:brightness(var(--ms-dim)) saturate(calc(var(--ms-dim) + .02))}
.ms-stage.ms-dim .ms-char img.ms-glow{filter:none}
.ms-prop{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:40;will-change:transform,opacity}
.ms-prop svg{display:block;overflow:visible}
.ms-prop path{transform-box:fill-box;transform-origin:left center}
`;

class Stage {
  constructor(env, cast, opts = {}) {
    this.env = env; this.doc = env.document || env.layer.ownerDocument;
    this.cast = cast.filter(c => c && c.manifest);
    this.o = {
      size: 1, fps: 12, moveFps: 24, heightCurve: 0.75, first: [1.2, 2.5], visit: [9, 16], dwell: 4.5, gap: [3, 7],
      meetChance: 0.45, pairChance: 0.2, meetEvery: 60, greetChance: 0.85, greetEvery: 20, farWalk: 340, walkLimit: 2.6, nightDim: 0.9, ...opts,
    };
    this.rand = env.random || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    const W = this.doc.defaultView;
    this.clock = env.clock || { now: () => performance.now(), raf: f => requestAnimationFrame(f), caf: id => cancelAnimationFrame(id) };
    this.timers = env.clock ? env.clock.timers || null : W ? { set: (f, ms) => W.setTimeout(f, ms), clear: id => W.clearTimeout(id) } : null;
    this.theme = env.theme === 'dark' ? 'dark' : 'light'; this.reduced = !!env.reducedMotion;
    this.time = 0; this.dt = 0; this.acc = 0; this.last = null; this.tick = 0;
    this.chars = []; this.duets = []; this.props = new Set();
    this.lastSlug = null; this.lastLedge = null; this.plan = null; this.slots = [false, false]; this.visits = 0;
    this.lastMeetAt = -Infinity; this.lastGreetAt = -Infinity; this.greet = null; this.greetPending = null;
    this.statsAcc = { n: 0, sum: 0, max: 0, steps: 0 };
    this.hold = { user: true, hidden: false, off: false }; this.running = false; this.raf = 0; this.timer = 0;
    if (!this.doc.getElementById('ms-style')) {
      const st = this.doc.createElement('style'); st.id = 'ms-style'; st.textContent = STYLE; this.doc.head.append(st);
    }
    this.root = this.doc.createElement('div'); this.root.className = 'ms-stage'; this.root.setAttribute('aria-hidden', 'true');
    env.layer.append(this.root);
    this.setTheme(this.theme);
    this.frameFn = now => this.frame(now);
    this.vp = env.viewport();
    // pause while the tab is hidden or the stage is scrolled away
    this.onVis = () => { this.hold.hidden = this.doc.hidden; this.wake(); };
    this.doc.addEventListener('visibilitychange', this.onVis);
    if (W && W.IntersectionObserver && opts.observe !== false) {
      this.io = new W.IntersectionObserver(es => { this.hold.off = !es[es.length - 1].isIntersecting; this.wake(); });
      this.io.observe(env.layer);
    }
    // reduced motion: when scrolling stops with the still character out of view, it is simply somewhere in view
    this.onScroll = () => {
      if (!this.reduced || !W) return;
      W.clearTimeout(this.scrollT); this.scrollT = W.setTimeout(() => this.restill(), 250);
    };
    this.doc.addEventListener('scroll', this.onScroll, true);
    if (W) W.addEventListener('resize', this.onScroll);
    if (this.reduced) this.still(); else this.plan = { at: this.between(this.o.first), type: 'visit' };
    if (opts.autoplay !== false) this.start();
  }
  get k() { return (this.env.unitHeight || 120) * this.o.size / 420; }
  between([a, b]) { return this.time + a + this.rand() * (b - a); }
  emit(type, ch, extra) { if (this.o.onEvent) this.o.onEvent({ type, slug: ch.slug, name: ch.name, t: this.time, ...extra }); }
  ledges() { const l = this.env.ledges; return (typeof l === 'function' ? l() : l) || []; }
  content() { const c = this.env.content; return (typeof c === 'function' ? c() : c) || []; }
  offX(ch, side) { const vp = this.vp; return side === 'left' ? vp.x - ch.halfW - 24 : vp.x + vp.w + ch.halfW + 24; }
  // the pencil props near this character take: the ledge says which reads on its background, else the theme's
  inkOf(ch) {
    const ink = ch && ch.plan && ch.plan.ledge && ch.plan.ledge.ink, v = ink && ink[this.theme];
    return v === 'light' || v === 'dark' ? v : this.theme === 'dark' ? 'light' : 'dark';
  }
  // a prop's centre moved up until its box (w × h) is off every word, button and card it would cover (the elements
  // characters hide behind count too); null if that takes more than `limit` px
  clearOf(x, y, w, h, limit = Infinity) {
    const rects = [...this.content(), ...this.ledges().map(l => l.cover).filter(Boolean)], y0 = y;
    for (let i = 0; i < 5; i++) {
      const box = { x: x - w / 2, y: y - h / 2, w, h }, r = rects.find(q => q && hit(box, q, 3));
      if (!r) return y0 - y > limit ? null : [x, y];
      y = Math.min(y, (r.top && r.top.length ? Math.min(r.y, ...r.top.map(q => q[1])) : r.y) - h / 2 - 6);
    }
    return null;
  }
  wavesBetween(L, R) {   // where (and how big) the three waves go between two faces apart, or null if no room
    const [ax, ay] = L.facePage(), [bx, by] = R.facePage(), k = (L.k + R.k) / 2;
    const s = clamp((bx - ax) / k * 0.5 / 85, 1, 1.9), w = 100 * k * s, h = 44 * k * s;
    const at = this.clearOf((ax + bx) / 2, (ay + by) / 2 - 6 * k, w, h, Math.max(L.h, R.h) * 0.75);
    return at && [at[0], at[1], k * s];
  }

  api() {
    const api = {
      start: () => this.start(), stop: () => this.stopUser(), pause: () => this.stopUser(), resume: () => this.start(),
      next: () => this.next(), meet: variant => this.meet(variant), canMeet: () => !!this.meetLedge(),
      visit: (o = {}) => this.visitNow(o),
      setOptions: o => this.setOptions(o), setTheme: t => this.setTheme(t), setReducedMotion: v => this.setReduced(v),
      advance: sec => this.advance(sec), refresh: () => { this.vp = this.env.viewport(); this.update(0); },
      visitors: () => this.chars.map(c => ({ slug: c.slug, name: c.name, x: c.x, y: c.y, mode: c.mode, ledge: c.plan && c.plan.ledge.id, h: c.h })),
      stats: () => ({ ...this.statsAcc, avgMs: this.statsAcc.n ? this.statsAcc.sum / this.statsAcc.n : 0 }),
      resetStats: () => { this.statsAcc = { n: 0, sum: 0, max: 0, steps: 0 }; },
      destroy: () => this.destroy(),
    };
    Object.defineProperty(api, 'time', { get: () => this.time, enumerable: true });
    return api;
  }

  // --- the clock ---
  // stepped mode: an update every 1/24 s (poses change on every other one), woken by a timer just before it is due
  // and drawn on the next animation frame, so the page idles in between; smooth mode: every animation frame
  stepSec() { return this.o.fps ? 1 / (this.o.fps * this.every()) : 0; }
  every() { return this.o.fps ? Math.max(1, Math.round((this.o.moveFps || this.o.fps) / this.o.fps)) : 1; }
  start() { this.hold.user = false; this.wake(); }
  stopUser() { this.hold.user = true; this.wake(); }
  wake() {   // start or stop the frame loop to match the holds (user pause, hidden tab, off screen, reduced motion)
    const run = !this.hold.user && !this.hold.hidden && !this.hold.off && !this.destroyed && !this.reduced;
    if (run && !this.running) { this.running = true; this.last = null; this.loop(); }
    if (!run && this.running) {
      this.running = false;
      if (this.raf) this.clock.caf(this.raf);
      if (this.timer && this.timers) this.timers.clear(this.timer);
      this.raf = this.timer = 0;
    }
  }
  loop() {   // schedule the next frame, unless something stopped the loop meanwhile
    if (!this.running || this.raf || this.timer) return;
    const step = this.stepSec();
    if (step && this.timers && this.last != null) {
      const wait = (step - this.acc) * 1000 - 6;   // wake a little early: the frame itself waits for the screen
      if (wait > 2) { this.timer = this.timers.set(() => { this.timer = 0; if (this.running) this.raf = this.clock.raf(this.frameFn); }, wait); return; }
    }
    this.raf = this.clock.raf(this.frameFn);
  }
  frame(now) {
    this.raf = 0;
    try {
      const t0 = this.clock.now();
      const real = this.last == null ? 0 : Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const step = this.stepSec();
      if (step) {
        this.acc += real;
        if (this.acc >= step - 0.017) {   // due within a screen frame: step now (the difference carries over)
          const n = Math.max(1, Math.round(this.acc / step)); this.acc = Math.max(-0.017, this.acc - n * step);
          for (let i = 0; i < n; i++) this.update(step);
          this.statsAcc.steps++;
        }
      } else if (real > 0) { this.update(real); this.statsAcc.steps++; }
      const ms = this.clock.now() - t0, s = this.statsAcc;
      s.n++; s.sum += ms; s.max = Math.max(s.max, ms);
    } finally {
      this.loop();   // one bad frame never stops the stage
    }
  }
  advance(sec) {   // run the stage for `sec` seconds of its own time, now (for tests and stills)
    const step = this.stepSec() || 1 / 60;
    for (let t = 0; t < sec - 1e-9; t += step) this.update(step);
  }

  update(dt) {
    this.dt = dt; this.time += dt;
    this.vp = this.env.viewport();
    this.tick = (this.tick + 1) % this.every();
    const full = this.tick === 0 || !this.o.fps;
    if (!this.reduced) this.schedule();
    for (const ch of this.chars) ch.base();
    if (!this.reduced) this.greetCheck();
    for (const ch of this.chars) ch.run();
    for (const d of this.duets) {
      if (d.gen.next().done) d.done = true;
      else if (d.met && !this.inView(d.a, 0) && !this.inView(d.b, 0)) { this.dropProps(d); d.done = true; d.a.gone = d.b.gone = true; }
    }
    this.duets = this.duets.filter(d => !d.done);
    for (const ch of this.chars) { ch.overlay(dt); ch.render(full); }
    if (full) for (const p of this.props) p.flush();
    if (!this.reduced) this.watch();
    for (const ch of this.chars.filter(c => c.gone || (!c.tasks.length && !c.duet && !c.still))) this.remove(ch);
  }

  // --- who comes, when, and where ---
  schedule() {
    const pl = this.plan;
    if (!pl || this.time < pl.at) return;
    if (pl.type === 'meet') {
      const host = pl.host;
      if (!this.chars.includes(host) || host.gone || host.duet || host.mode === 'exit' || this.time > pl.until) { this.plan = null; return; }
      if (host.mode === 'enter' || !host.between) { pl.at = this.time + 0.1; return; }   // still arriving, or busy
      this.plan = null;
      if (this.chars.length !== 1 || !this.inView(host, 0)) return;
      if (this.canJoin(host) && !(host.plan.ledge.partner && this.rand() < 0.35)) { this.join(host); this.lastMeetAt = this.time; }
      else if (this.across(host) || (this.canJoin(host) && this.join(host))) this.lastMeetAt = this.time;
      return;
    }
    if (this.chars.length >= 2) { pl.at = this.time + 0.5; return; }
    if (pl.type === 'pair') {
      if (this.chars.length) { pl.at = this.time + 0.3; return; }
      this.plan = null; this.pairUp(); return;
    }
    const ch = this.spawn(this.pickCast(), null, { first: this.visits === 0, with: this.chars[0] });
    if (!ch) { pl.at = this.time + 1.5; return; }
    this.plan = null;
    if (this.chars.length === 1 && this.o.pairChance + this.o.meetChance > 0) {
      const r = this.rand(), l = ch.plan.ledge, mc = l.meetChance ?? this.o.meetChance;
      const meetable = (l.meet && ch.plan.stance === 'stand') || l.partner;
      if (meetable && r < mc && this.time - this.lastMeetAt >= this.o.meetEvery) this.plan = { at: this.time + 3.5 + this.rand() * 2.5, until: this.time + 14, type: 'meet', host: ch };
      else if (r < mc + this.o.pairChance) this.plan = { at: this.between([4, 7]), type: 'visit' };
    }
  }

  pickCast(exclude = []) {
    const busy = new Set([...this.chars.map(c => c.slug), ...exclude]);
    let pool = this.cast.filter(c => !busy.has(c.slug) && c.slug !== this.lastSlug);
    if (!pool.length) pool = this.cast.filter(c => !busy.has(c.slug));
    if (!pool.length) return null;
    const w = pool.map(c => (c.traits && c.traits.often && c.traits.often[this.theme]) || 1);
    let r = this.rand() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < pool.length; i++) if ((r -= w[i]) <= 0) return pool[i];
    return pool[pool.length - 1];
  }
  freeSlot() { const i = this.slots.indexOf(false); if (i < 0) return -1; this.slots[i] = true; return i; }

  spawn(entry = this.pickCast(), only, o) {
    if (!entry) return null;
    const slot = this.freeSlot(); if (slot < 0) return null;
    const ch = new Puppet(this, entry, slot);
    const pl = this.place(ch, only, o);
    if (!pl) { ch.destroy(); this.slots[slot] = false; return null; }
    this.begin(ch, pl);
    ch.push(visit(this, ch, pl));
    this.visits++;
    return ch;
  }
  begin(ch, pl) {
    ch.plan = pl; ch.surface = pl.surface; ch.y = pl.y; ch.x = pl.x; ch.noShadow = !!pl.noShadow;
    ch.sitU = 0; ch.floorU = 0; ch.base();
    if (pl.how === 'pop') ch.pose.popY = 0.02;
    this.chars.push(ch); this.lastSlug = ch.slug; this.lastLedge = pl.ledge.id;
    this.emit('enter', ch, { label: pl.ledge.label, how: pl.how, side: pl.side, ledge: pl.ledge.id });
  }
  remove(ch) {
    ch.destroy(); this.slots[ch.slot] = false;
    this.chars = this.chars.filter(c => c !== ch);
    if (!this.chars.length && !this.reduced && (!this.plan || this.plan.type === 'meet')) this.plan = { at: this.between(this.o.gap), type: 'visit' };
  }

  // a plan for `ch` at a random ledge in view (null if none fits): where it stands, how it gets there, how long.
  // A spot, a peek or an edge holds one character, and a group (the headline's two ends) one at a time; nobody
  // stands where another stands or is heading, nor walks in through them; not the same place twice in a row.
  place(ch, only, o = {}) {
    const vp = this.vp, cands = [];
    const taken = new Set(), groups = new Set();
    for (const c of this.chars) if (c !== ch && c.plan) { taken.add(c.plan.ledge.id); if (c.plan.ledge.group) groups.add(c.plan.ledge.group); }
    for (const l of this.ledges()) {
      if (only && !only(l)) continue;
      if (l.kind !== 'line' && taken.has(l.id)) continue;
      if (!only && l.avoid && l.avoid.includes(ch.slug)) continue;   // e.g. a pale character on a pale background
      if (!only && l.group && groups.has(l.group)) continue;
      let pl = this.fit(ch, l, vp);
      if (!pl) continue;
      if (this.collides(ch, pl)) {   // in the way: come from the other side, or pop up where the walk would cross someone
        if (pl.how === 'walk' && l.kind === 'line') { pl = { ...pl, side: pl.side === 'left' ? 'right' : 'left' }; pl.exitSide = pl.side; }
        else if (pl.how === 'walk' && pl.far) pl = { ...pl, how: 'pop' };
        if (this.collides(ch, pl)) continue;
      }
      let w = (l.weight ?? 1) * (l.prefer && l.prefer.includes(ch.slug) ? 5 : 1) * (l.kind === 'line' ? 1.4 : 1);
      if (o.first && (l.meet || l.partner)) w *= 3;   // the first visitor of the page goes where a meeting can happen
      const mate = o.with && o.with.plan;   // a second visitor goes where the two can see each other: across, or level
      if (mate && mate.ledge.partner === l.id) w *= 4;
      else if (mate && Math.abs(pl.y - mate.y) < Math.max(ch.h, o.with.h) * 0.6 && Math.abs(pl.x - mate.x) > ch.halfW + o.with.halfW + 20) w *= 2;
      const zw = ch.traits.zones && ch.traits.zones[this.theme];
      if (zw && l.zone && zw[l.zone] != null) w *= zw[l.zone];
      cands.push([w, pl]);
    }
    const fresh = cands.filter(c => c[1].ledge.id !== this.lastLedge);
    const pool = !only && fresh.length ? fresh : cands;
    if (!pool.length) return null;
    let r = this.rand() * pool.reduce((s, c) => s + c[0], 0);
    const pl = (pool.find(c => (r -= c[0]) <= 0) || pool[pool.length - 1])[1];
    if (pl.how === 'walk') pl.speed = quick(ch, Math.abs(pl.x - this.offX(ch, pl.side)), this.o.walkLimit);
    const dur = this.o.visit[0] + this.rand() * (this.o.visit[1] - this.o.visit[0]);
    const out = pl.how === 'walk' ? Math.min(pl.x - vp.x, vp.x + vp.w - pl.x) + ch.halfW : 0;
    pl.endAt = this.time + dur;
    pl.exitDur = pl.how === 'walk' ? Math.min(this.o.walkLimit, out / (ch.pace() * quick(ch, out, this.o.walkLimit) * 1.3)) + 0.4 : pl.how === 'pop' ? 0.5 : 1.2;
    return pl;
  }
  // is `pl` where someone else stands or is heading, or is its way in through someone on the same level?
  collides(ch, pl) {
    for (const o of this.chars) {
      if (o === ch || o.gone) continue;
      const tall = Math.max(o.h, ch.h), room = o.halfW + ch.halfW + 24;
      for (const [ox, oy] of [[o.x, o.y], o.plan ? [o.plan.x, o.plan.y] : null]) {
        if (ox == null) continue;
        if (Math.abs(ox - pl.x) < room && Math.abs(oy - pl.y) < tall) return true;
      }
      if (pl.how === 'walk') {
        const x0 = this.offX(ch, pl.side), lo = Math.min(x0, pl.x), hi = Math.max(x0, pl.x);
        const a = o.mode === 'enter' && o.plan ? Math.min(o.x, o.plan.x) : o.x, b = o.mode === 'enter' && o.plan ? Math.max(o.x, o.plan.x) : o.x;
        if (b + o.halfW > lo - ch.halfW && a - o.halfW < hi + ch.halfW && Math.abs(o.y - pl.y) < tall * 0.8) return true;
      }
    }
    return false;
  }
  // which side to walk off: the nearer, unless someone stands that way on the same level (null: both ways blocked)
  exitSide(ch, pl) {
    const vp = this.vp, near = pl.exitSide || (ch.x - vp.x < vp.x + vp.w - ch.x ? 'left' : 'right');
    const blocked = side => !this.pathClear(ch, ch.x, this.offX(ch, side)) || this.chars.some(o => o !== ch && !o.gone && !o.duet && Math.abs(o.y - ch.y) < Math.max(o.h, ch.h) * 0.8
      && (side === 'left' ? o.x < ch.x && o.x + o.halfW > vp.x - 40 : o.x > ch.x && o.x - o.halfW < vp.x + vp.w + 40));
    if (!blocked(near)) return near;
    const other = near === 'left' ? 'right' : 'left';
    return blocked(other) ? (ch.stance === 'stand' || ch.stance === 'floor' ? null : near) : other;
  }
  // can ch walk from x0 to x1 at its level without crossing words or a button (the QR card, the badges, a line of
  // text)? Its own spot's `clear` rects excepted where it stands
  pathClear(ch, x0, x1) {
    const dir = Math.sign(x1 - x0) || 1, y0 = ch.y - ch.h * 0.85, y1 = ch.y - ch.h * 0.1;
    const from = x0 + dir * ch.halfW * 0.3, to = x1 + dir * ch.halfW, lo = Math.min(from, to), hi = Math.max(from, to);   // what lies ahead of it
    return !this.content().some(r => r && r.x < hi && r.x + r.w > lo && r.y < y1 && r.y + r.h > y0);
  }
  fit(ch, l, vp) {
    const k = ch.k, m = 10, top = vp.y + m, bottom = vp.y + vp.h - m;
    const H = ch.h, halfW = ch.halfW, R = ch.rig;
    const inX = (x, half = halfW) => x - half >= vp.x + 4 && x + half <= vp.x + vp.w - 4;
    if (l.kind === 'line' || l.kind === 'edge') {
      const stance = l.kind === 'edge' ? l.stance || 'sit' : 'stand';
      const inset = l.kind === 'edge' ? halfW * (stance === 'sit' ? 0.6 : 0.15) : 0;
      const pts = l.points, x0 = Math.max(pts[0][0] + inset, vp.x + halfW + 16);
      const x1 = Math.min(pts[pts.length - 1][0] - inset, vp.x + vp.w - halfW - 16);
      if (x1 < x0) return null;
      const foot = (R.hipX + 24) * k;
      for (let i = 0; i < 6; i++) {
        let x = x0 + this.rand() * (x1 - x0);
        if (l.kind === 'line') {   // within ~40% of the view's width from one side or the other: shorter walks in and out
          const reach = Math.min(x1 - x0, vp.w * 0.4) * this.rand();
          x = this.rand() < 0.5 ? x0 + reach : x1 - reach;
        }
        const y = l.kind === 'edge' ? topY(pts, x - foot, x + foot) : pathY(pts, x);
        const up = stance === 'sit' ? (R.bodyH + R.decoH0 - 3) * k : H, down = stance === 'sit' ? (R.hipY - R.tp[1] + 3 + 0.86 * R.legLen) * k : 0;
        if (y - up < top || y + Math.max(0, down) > bottom) continue;
        if (l.ceiling != null && y - up < l.ceiling) continue;
        if (l.clear && l.clear.length) {   // words or an arrow right above (the card over this one): keep the body off them
          const half = stance === 'sit' ? ch.halfWFor('sit') : halfW * 0.8;
          const box = { x: x - half, y: y - up, w: half * 2, h: up };
          if (l.clear.some(r => r && hit(box, r, 2))) continue;
        }
        if (l.kind === 'line') {
          const side = x - vp.x < vp.x + vp.w - x ? 'left' : 'right';
          return { ledge: l, how: 'walk', side, x, y, stance: 'stand', surface: xx => pathY(pts, xx) };
        }
        if (l.enter === 'pop') return { ledge: l, how: 'pop', x, y, stance, surface: () => y };
        return { ledge: l, how: 'climb', x, y, stance, cover: l.cover, surface: xx => pathY(pts, xx) };
      }
      return null;
    }
    if (l.kind === 'spot') {
      // keep clear of the ledge's `clear` rects (the button beside it, a line of text above): a wide character
      // stands a little further off
      const stance = l.stance || 'stand', half = ch.halfWFor(stance);
      const tall = stance === 'floor' ? H - (R.gy - R.tp[1] - 4) * k : H;
      let x = l.x;
      for (const r of l.clear || []) {
        if (!r || l.y - tall > r.y + r.h || l.y < r.y) continue;
        x = l.x <= r.x + r.w / 2 ? Math.min(x, r.x - half - 4) : Math.max(x, r.x + r.w + half + 4);
      }
      if (!inX(x, half) || l.y - tall < top || l.y > bottom) return null;
      if (l.ceiling != null && l.y - tall < l.ceiling) return null;
      const side = l.from === 'left' || l.from === 'right' ? l.from : x - vp.x < vp.x + vp.w - x ? 'left' : 'right';
      // a long way in from the side: pop up there instead, more often than not (a walk eats the visit)
      const far = Math.abs(x - this.offX(ch, side)) > this.o.farWalk;
      const how = l.enter === 'pop' || (far && l.enter !== 'walk' && this.rand() < 0.6) ? 'pop' : 'walk';
      return { ledge: l, how, far, side, exitSide: side, x, y: l.y, stance, target: l.target, surface: () => l.y };
    }
    if (l.kind === 'peek') {
      const c = l.cover, g = l.ground ?? c.y + c.h;
      if (l.side === 'top') {
        const x = l.x ?? c.x + c.w / 2;
        if (!inX(x)) return null;
        const cy = c.top && c.top.length ? pathY(c.top, x) : c.y;
        // show no more than fits under the ledge's ceiling (the line of text above), and at least the eyes
        let show = l.show ?? 0.6;
        if (l.ceiling != null) show = Math.min(show, ((cy - l.ceiling) / k - ch.decoH) / R.height);
        if (show < 1 - (R.gy - Math.max(R.eyes[0][1], R.eyes[1][1])) / R.height + 0.06) return null;   // eyes over the edge
        const rise1 = (g - cy) / k - (1 - show) * ch.rig.height, rise0 = (g - cy) / k - ch.rig.height - ch.decoH - 8;
        if (cy - show * ch.rig.height * k - ch.decoH * k < top || g > bottom + 40) return null;
        if (x - halfW < c.x - 2 || x + halfW > c.x + c.w + 2) return null;   // wider than what hides it
        return { ledge: l, how: 'rise', x, y: g, stance: 'peek', cover: c, show, rise0, rise1, noShadow: true, target: l.target, surface: () => g };
      }
      const vis = l.reveal ?? 0.6, W2 = halfW * 2, dir = l.side === 'left' ? -1 : 1;
      const edgeX = l.side === 'left' ? c.x : c.x + c.w;
      const x = edgeX + dir * (vis * W2 - halfW), x0 = edgeX - dir * (halfW + 4);
      if (x - halfW < vp.x + 2 || x + halfW > vp.x + vp.w - 2) return null;
      if (g - H < Math.max(top, c.y - 30) || g > bottom) return null;
      return { ledge: l, how: 'slide', x, x0, y: g, ground: g, stance: 'peek', cover: c, target: l.target, hidden: l.side === 'left' ? 'R' : 'L', surface: () => g };
    }
    return null;
  }
  inView(ch, margin = 0) {
    const vp = this.vp;
    return ch.x + ch.halfW > vp.x - margin && ch.x - ch.halfW < vp.x + vp.w + margin && ch.y > vp.y - margin && ch.y - ch.h < vp.y + vp.h + margin;
  }

  pickAct(ch, pl, last, n) {
    while (pl.first && pl.first.length) { const a = pl.first.shift(); if (ACTS[a]) return a; }
    const stance = pl.stance === 'peek' ? 'peek' : ch.stance;
    const R = ch.rig, likes = ch.traits.likes || [];
    let acts = (pl.ledge.acts || ['look', 'wave']).filter(a => ACT_STANCE[stance].includes(a) && ACTS[a]);
    acts = acts.filter(a => (a !== 'reveal' || R.has('torso-alt')) && (a !== 'twinkle' || R.has('stars'))
      && (a !== 'nap' || ch.traits.naps || (pl.ledge.prefer || []).includes(ch.slug))
      && (!['point', 'beckon', 'lean', 'write'].includes(a) || pl.target) && (a !== 'deco' || R.deco) && (a !== 'point' || pl.how !== 'rise')
      && (!['wave', 'beckon'].includes(a) || pl.how !== 'rise' || ch.waveArm('L')));   // over the top of what it peeks from, only if a mitten can show
    if (!acts.length) acts = ['look'];
    const left = pl.endAt - pl.exitDur - this.time;
    const w = acts.map(a => (a === last ? 0.05 : 1) * (likes.includes(a) ? 3 : 1) * (n === 0 && a === 'wave' ? 2 : 1)
      * (a === 'nap' ? 4 : 1) * (left < 2.5 && ['read', 'nap', 'lean', 'write'].includes(a) ? 0.2 : 1));
    let r = this.rand() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < acts.length; i++) if ((r -= w[i]) <= 0) return acts[i];
    return acts[acts.length - 1];
  }

  // a character whose spot scrolled away hurries off (or simply goes, if nobody can see it)
  watch() {
    const vp = this.vp;
    for (const ch of this.chars) {
      if (ch.mode === 'exit' || ch.gone || ch.still || ch.duet) continue;
      const spotIn = ch.plan && ch.plan.x > vp.x - 20 && ch.plan.x < vp.x + vp.w + 20 && ch.plan.y > vp.y - 10 && ch.plan.y - ch.h < vp.y + vp.h + 10;
      if (spotIn || ch.mode === 'enter' && this.inView(ch, 200)) continue;
      if (!this.inView(ch, 4)) { ch.gone = true; if (ch.duet) this.endDuet(ch.duet); continue; }
      this.leaveSoon(ch, {});
    }
  }
  leaveSoon(ch, { shy: isShy } = {}) {
    if (ch.duet) this.endDuet(ch.duet, ch);
    ch.fx = []; this.dropProps(ch); ch.between = false;
    ch.tasks = [(function* (S) { if (isShy) yield* shy(S, ch); yield* leave(S, ch, ch.plan, 1.7); })(this)];
    ch.mode = 'exit';
  }
  endDuet(d, except) {
    d.done = true; this.dropProps(d);
    this.duets = this.duets.filter(x => x !== d);
    for (const ch of [d.a, d.b]) {
      ch.duet = null;
      if (ch === except || ch.gone) continue;
      ch.plan.how = 'walk';
      ch.tasks = [(function* (S) { yield* idle(S, ch, 0.6, ch === d.a ? 8 : -8); yield* leave(S, ch, ch.plan, 1.4); })(this)];
    }
  }

  // --- greetings from afar: two characters on screen, each at its own place ---
  greetCheck() {
    if (this.chars.length !== 2 || this.duets.length) { this.greet = null; return; }
    const [c0, c1] = this.chars;
    if (c0.mode !== 'act' || c1.mode !== 'act' || c0.still || c1.still) return;
    let g = this.greet;
    if (!g || !((g.a === c0 && g.b === c1) || (g.a === c1 && g.b === c0))) {   // a new pair: decide once
      const p = this.greetPending, sure = !!(p && [c0, c1].includes(p.a) && [c0, c1].includes(p.b));
      g = this.greet = { a: c0, b: c1, sure, go: sure || (this.time - this.lastGreetAt >= this.o.greetEvery && this.rand() < this.o.greetChance), started: false, until: this.time + 7 };
      this.greetPending = null;
    }
    if (!g.go || g.started || this.time > g.until) return;
    if (!c0.between || !c1.between) return;
    const vp = this.vp;
    // in sight of each other: both in view, apart but not across the whole page, about level, and room for the waves
    // between them that covers no words, button or card
    const tall = Math.max(c0.h, c1.h), dx = Math.abs(c0.x - c1.x), [L, R] = c0.x < c1.x ? [c0, c1] : [c1, c0];
    const ok = this.inView(c0, -8) && this.inView(c1, -8) && dx > c0.halfW + c1.halfW + 16 && dx < Math.min(vp.w * 0.92, tall * 6)
      && Math.abs(c0.facePage()[1] - c1.facePage()[1]) < tall * 0.9 && this.wavesBetween(L, R);
    if (!ok) { g.go = false; return; }
    g.started = true; this.lastGreetAt = this.time;
    const sh = {};
    L.push(greetFromAfar(this, L, R, sh, 1)); R.push(greetFromAfar(this, R, L, sh, -1));
    this.emit('act', L, { act: 'greet', pair: true, label: `${L.name} 和 ${R.name} 遠遠地揮手、一起共振` });
  }
  greetWait(ch) {   // a greeting is decided for ch's pair but hasn't started: wait for the other a moment
    const g = this.greet;
    return !!(g && g.go && !g.started && (g.a === ch || g.b === ch) && this.time < g.until);
  }

  // --- meetings ---
  meetLedge() {
    const vp = this.vp;
    return this.ledges().find(l => l.meet && l.kind === 'line' && (() => {
      const xs = [vp.x + vp.w * 0.3, vp.x + vp.w / 2, vp.x + vp.w * 0.7].map(x => pathY(l.points, x));
      return xs.every(y => y - 1.6 * this.k * 420 > vp.y && y < vp.y + vp.h - 8);
    })());
  }
  // can a guest walk up to `host` and stand beside it, in view, on the open side?
  canJoin(host) {
    const l = host.plan.ledge, vp = this.vp;
    if (!l.meet || host.plan.stance !== 'stand' || !['walk', 'pop'].includes(host.plan.how) || (l.kind !== 'line' && l.kind !== 'spot')) return false;
    const right = l.kind === 'spot' && l.from ? l.from === 'right' : vp.x + vp.w - host.x > host.x - vp.x;
    const need = host.halfW * 3.6 + 16;   // a guest about the host's size, half a body apart, inside the view
    return right ? host.x + need < vp.x + vp.w : host.x - need > vp.x;
  }
  // too narrow to walk up (a phone, the headline): a guest comes to the place across and they greet from afar
  across(host) {
    const l = host.plan.ledge;
    if (!l.partner) return false;
    const entry = this.pickCast([host.slug]); if (!entry) return false;
    const ch = this.spawn(entry, x => x.id === l.partner);
    if (!ch) return false;
    this.greetPending = { a: host, b: ch };
    return true;
  }
  join(host) {   // a guest walks up to `host`, who is standing on a ledge both can walk along
    const entry = this.pickCast([host.slug]); if (!entry) return false;
    const slot = this.freeSlot(); if (slot < 0) return false;
    const g = new Puppet(this, entry, slot), vp = this.vp, l = host.plan.ledge, surface = host.plan.surface;
    // the guest comes from the open side of a stand spot, else from the side with more room
    const right = l.kind === 'spot' && l.from ? l.from === 'right' : vp.x + vp.w - host.x > host.x - vp.x;
    const pl = { ledge: l, how: 'walk', side: right ? 'right' : 'left', x: this.offX(g, right ? 'right' : 'left'), y: 0, stance: 'stand', surface, endAt: 0, exitDur: 0 };
    pl.y = surface(pl.x);
    this.begin(g, pl);
    g.mode = 'duet-walk';
    host.tasks = []; host.mode = 'duet'; host.between = false; this.dropProps(host);
    if (host.plan.how === 'pop') host.plan.how = 'walk';   // they leave walking
    const d = { a: right ? host : g, b: right ? g : host, host, mode: 'host' };
    this.startDuet(d);
    return true;
  }
  pairUp(l = this.meetLedge()) {
    if (!l) return false;
    const e1 = this.pickCast(), e2 = e1 && this.pickCast([e1.slug]);
    if (!e2) return false;
    const vp = this.vp, surface = x => pathY(l.points, x);
    const mk = (entry, side) => {
      const ch = new Puppet(this, entry, this.freeSlot());
      const x = this.offX(ch, side);
      this.begin(ch, { ledge: l, how: 'walk', side, x, y: surface(x), stance: 'stand', surface, endAt: 0, exitDur: 0 });
      ch.mode = 'duet-walk'; return ch;
    };
    const a = mk(e1, 'left'), b = mk(e2, 'right');
    this.startDuet({ a, b, mode: 'pair' });
    this.lastMeetAt = this.time;
    return true;
  }
  startDuet(d) {
    d.a.duet = d.b.duet = d;
    if (this.variant) { d.variant = this.variant; this.variant = null; }
    d.gen = duet(this, d);
    for (const ch of [d.a, d.b]) ch.tasks = [(function* () { while (ch.duet) yield; })()];
    this.duets.push(d);
  }
  meet(variant) {   // variant: 'none' | 'note' | 'five' (default: by chance)
    if (this.reduced) return false;
    this.variant = variant || null;
    const host = this.chars.find(c => c.mode === 'act' && !c.duet && this.inView(c, 0));
    if (host && this.chars.length === 1) {
      if (this.canJoin(host)) { this.join(host); return true; }
      if (this.across(host)) { this.variant = null; return true; }
    }
    if (!this.meetLedge()) return false;
    for (const ch of this.chars) if (ch.mode !== 'exit') this.leaveSoon(ch);
    this.plan = { at: this.time, type: 'pair' };
    return true;
  }
  // a visitor now: this character (by slug) at this ledge (by id), if it fits in view; acts: what it does first
  visitNow({ ledge, slug, acts } = {}) {
    if (this.reduced) return false;
    this.clearAll(); this.plan = null; this.vp = this.env.viewport();
    const entry = (slug && this.cast.find(c => c.slug === slug)) || this.pickCast();
    const ch = this.spawn(entry, ledge ? l => l.id === ledge : null);
    if (ch && acts) ch.plan.first = [...acts].filter(a => ACTS[a]);
    if (!ch) this.plan = { at: this.time + 0.5, type: 'visit' };
    return !!ch;
  }
  next() {
    if (this.reduced) return;
    for (const ch of this.chars) if (ch.mode !== 'exit') this.leaveSoon(ch);
    this.plan = { at: this.time + 0.3, type: 'visit' };
  }

  // --- options ---
  setOptions(o) {
    const size = (o.size != null && o.size !== this.o.size) || (o.heightCurve != null && o.heightCurve !== this.o.heightCurve);
    Object.assign(this.o, o);
    if (size) for (const ch of this.chars) { ch.scaleBy(); ch.layout(); ch.render(true); }
    if (o.theme || o.nightDim != null) this.setTheme(o.theme || this.theme);
    if (o.reducedMotion != null) this.setReduced(o.reducedMotion);
  }
  setTheme(t) {
    this.theme = t === 'dark' ? 'dark' : 'light';
    this.root.classList.toggle('ms-dark', this.theme === 'dark');
    // on the dark page the light papers would outshine every word: dim the characters a touch (not the stars' glow)
    const dim = this.theme === 'dark' && this.o.nightDim < 1;
    this.root.classList.toggle('ms-dim', dim);
    if (dim) this.root.style.setProperty('--ms-dim', String(this.o.nightDim)); else this.root.style.removeProperty('--ms-dim');
    for (const ch of this.chars) ch.render(true);
  }
  setReduced(v) {
    v = !!v;
    if (v === this.reduced) return;
    this.reduced = v;
    this.clearAll();
    if (v) this.still(); else this.plan = { at: this.between(this.o.first), type: 'visit' };
    this.wake();
  }
  clearAll() {
    for (const ch of this.chars) { ch.destroy(); this.slots[ch.slot] = false; }
    this.chars = []; this.duets = []; this.greet = null; this.greetPending = null;
    for (const p of [...this.props]) p.remove();
  }
  // reduced motion: one character standing still somewhere in view (a stand spot, an edge, the wave, a seat on a
  // card, peeking — in that order, nearest the upper middle of the view first), nothing moving
  still() {
    this.vp = this.env.viewport();
    const entry = this.cast.find(c => c.slug === 'tuck') || this.cast[0];
    if (!entry) return;
    const ch = new Puppet(this, entry, this.freeSlot());
    const vp = this.vp, rank = l => (l.kind === 'spot' && (l.stance || 'stand') === 'stand' ? 0 : l.kind === 'edge' && l.stance === 'stand' ? 1
      : l.kind === 'line' ? 2 : l.kind === 'edge' ? 3 : l.kind === 'peek' ? 4 : 5);
    const ly = l => (l.kind === 'spot' ? l.y : l.kind === 'peek' ? l.ground ?? l.cover.y : l.points[l.points.length >> 1][1]);
    const ledges = [...this.ledges()].filter(l => rank(l) < 5)
      .sort((a, b) => rank(a) - rank(b) || Math.abs(ly(a) - (vp.y + vp.h * 0.6)) - Math.abs(ly(b) - (vp.y + vp.h * 0.6)));
    let pl = null;
    for (const l of ledges) { pl = this.fit(ch, l, vp); if (pl) break; }
    if (!pl) { ch.destroy(); this.slots[ch.slot] = false; return; }
    ch.plan = pl; ch.x = pl.x; ch.y = pl.y; ch.surface = pl.surface; ch.still = true; ch.mode = 'still'; ch.noShadow = !!pl.noShadow;
    if (pl.stance === 'sit') { ch.sitU = 1; ch.stance = 'sit'; }
    if (pl.stance === 'floor') { ch.floorU = 1; ch.stance = 'floor'; }
    if (pl.how === 'rise') { ch.baseRise = pl.rise1; ch.goBehind(pl.cover, pl.rise0); }
    if (pl.how === 'slide') { ch.y = pl.ground; ch.goBehind(pl.cover, 0); }
    this.chars.push(ch);
    ch.base(); ch.overlay(0); ch.render(true);
  }
  restill() {
    if (!this.reduced || this.destroyed) return;
    this.vp = this.env.viewport();
    const ch = this.chars[0];
    if (ch && this.inView(ch, -ch.h * 0.25)) return;
    this.clearAll(); this.still();
  }

  prop(kind, owner, inkFrom) { const p = new Prop(this, kind, owner, inkFrom || (owner instanceof Puppet ? owner : null)); this.props.add(p); return p; }
  dropProps(owner) { for (const p of [...this.props]) if (p.owner === owner) p.remove(); }

  destroy() {
    this.destroyed = true; this.wake();
    this.doc.removeEventListener('visibilitychange', this.onVis);
    this.doc.removeEventListener('scroll', this.onScroll, true);
    const W = this.doc.defaultView; if (W) { W.removeEventListener('resize', this.onScroll); W.clearTimeout(this.scrollT); }
    if (this.io) this.io.disconnect();
    this.clearAll(); this.root.remove();
  }
}
