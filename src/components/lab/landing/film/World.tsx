/**
 * The film's world in the server's HTML (SPEC §3): every plane of every place as a group in one hidden <svg>'s defs
 * (painted with `ff-*` classes that read the hour's `--film-c-*` variables, so the light changes the same paper), the
 * stage's sky, stars, disc and clouds, the four scene sets of planes (each a <use> of its place's groups), the puppets
 * standing as stills at their marks inside their planes, and the particles. No SVG filter anywhere on the stage: the
 * paper is flat cut shapes (a torn edge, origami folds on the peaks, no shade under a layer) and the grain is one
 * overlay. A server component: none of the geometry ships to the browser.
 */
import { Fragment, type CSSProperties } from 'react';
import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { stillOf, type Still } from '@/lib/mascots/pals/still';
import { ellipse, path, ribbon, rng, tear, type Pt } from './script/geom';
import { ARMS_FRONT, CAST_OF, PLACE_OF, markOf, type PalSlug } from './script/marks';
import type { SceneN } from './script/timeline';
import type { Look } from './script/look';
import { SAND_TILE, pictureSrc } from './script/sand';
import sandDark from './sand-dark.png';
import sandLight from './sand-light.png';
import { CUT_STEP, FRINGE_DEPTH, PLANE_ORDER, REST_PLACES, REST_PLANES, cutClip, cutSamples, fringeArt, groundAt, placeArt, restClip, type PlaceId, type PlaneArt } from './script/world';
import { Island } from './Island';
import { islandHtml } from './islands';
import { compactPath } from './script/compact';
import { toHtml } from './staticHtml';
import { Still as StillView } from './Still';
import styles from './film.module.css';

const PLACES: PlaceId[] = ['home', 'journey', 'valley', 'valleyT'];

/** The paints: each class a variable of the hour (and the strokes' widths, which never scale). */
const PAINTS = `
.ff-range{fill:var(--film-c-range)}.ff-peaks{fill:var(--film-c-peaks)}.ff-sea{fill:var(--film-c-sea)}
.ff-headland{fill:var(--film-c-headland)}.ff-town{fill:var(--film-c-town)}.ff-hills{fill:var(--film-c-hills)}
.ff-near{fill:var(--film-c-near)}.ff-ground{fill:var(--film-c-ground)}
.ff-swell-b{fill:color-mix(in oklab,var(--film-c-range),var(--film-c-peaks) 52%)}.ff-swell-d{fill:color-mix(in oklab,var(--film-c-peaks),var(--film-c-headland) 42%)}
.ff-bridge{fill:var(--film-c-bridge)}.ff-bridge-wall{fill:color-mix(in oklab,var(--film-c-bridge),var(--film-c-ground) 38%)}.ff-roof{fill:var(--film-c-roof)}.ff-tree{fill:var(--film-c-tree)}
.ff-canopy{fill:var(--film-c-canopy)}.ff-fold-lit{fill:var(--film-c-fold-lit);opacity:.6}.ff-fold-dark{fill:var(--film-c-fold-dark);opacity:.5}
.ff-lit{fill:var(--film-c-lit)}.ff-accent{fill:var(--film-c-accent)}
.ff-lamp{fill:var(--film-c-lamp)}.ff-lamp-glow{fill:url(#film-lamp-glow)}.ff-mist{fill:var(--film-c-mist)}
.ff-fringe{fill:var(--film-c-fringe)}
.ff-trail{fill:color-mix(in oklab,var(--film-c-near),var(--film-c-rim) 34%)}
.ff-flower{fill:var(--film-c-rim);opacity:.85}.ff-flower-warm{fill:var(--film-c-accent)}
.fs-sea-line{fill:none;stroke:var(--film-c-sea-line);stroke-width:1.2px;stroke-linecap:round;opacity:.45}
.fs-swell-line{fill:none;stroke:color-mix(in oklab,var(--film-c-rim) 52%,var(--film-c-range));stroke-width:1.3px;stroke-linecap:round;stroke-linejoin:round;opacity:.4}
.fx-ns{vector-effect:non-scaling-stroke}
.fk-sand{fill:url(#film-sand);opacity:var(--film-sand,0);visibility:var(--film-sand-show,hidden)}
@media not all and (min-aspect-ratio:11/10){.ff-lonetree,.art-wide{display:none}}
@media (min-aspect-ratio:11/10){.art-tall{display:none}}
`.replace(/\n/g, '');

const groupId = (place: PlaceId, plane: string) => `film-${place}-${plane}`;
/** A plane's cut-out clip (a scene change's `cut` foot: its art and a short torn foot), by the group it clips. */
const cutId = (place: PlaceId, plane: string) => `${groupId(place, plane)}-cut`;
/** A middle flat's silhouette at rest (a scene change's `rest` foot), by the set's place (its nearer planes shape it). */
const restId = (place: PlaceId, plane: string) => `${groupId(place, plane)}-rest`;

/** Each place's cut-out clips: world units, the user space of the <use> that wears one. */
/** Each flown-away place's silhouettes at rest (script/world.ts `restClip`): world units, as the cut-outs. */
function RestClips({ place, look }: { place: PlaceId; look: Look }) {
  const art = placeArt(place, look);
  return (
    <>
      {art.planes.map((plane) => {
        const d = restClip(art, plane, 7400 + PLACES.indexOf(place) * 101 + PLANE_ORDER.indexOf(plane.id) * 13);
        return d ? (
          <clipPath key={plane.id} id={restId(place, plane.id)} clipPathUnits="userSpaceOnUse">
            <path d={d} />
          </clipPath>
        ) : null;
      })}
    </>
  );
}

function CutClips({ place, look }: { place: PlaceId; look: Look }) {
  return (
    <>
      {placeArt(place, look)
        .planes.filter((plane) => !plane.src)
        .map((plane) => {
          const d = cutClip(plane, 7100 + PLACES.indexOf(place) * 101 + PLANE_ORDER.indexOf(plane.id) * 13);
          return d ? (
            <clipPath key={plane.id} id={cutId(place, plane.id)} clipPathUnits="userSpaceOnUse">
              <path d={d} />
            </clipPath>
          ) : null;
        })}
    </>
  );
}

/** The paints that are paper (a hill, the sea, a roof, a tree): what the paper's sand lies on (script/sand.ts). */
const PAPER = /(^| )ff-(range|swell-b|peaks|swell-d|sea|headland|town|hills|near|ground|bridge|bridge-wall|roof|tree|canopy|trail)( |$)/;

/**
 * A plane's parts, in order. A paper part is cut once, unpainted, and used twice: with its paint, then with the
 * paper's sand (`.fk-sand`: its strength the film's `--film-sand`) — so the sand lies on each paper exactly once,
 * cut to its edge, and the next paper laid over it covers it as it covers the paper.
 */
function PlaneGroup({ place, plane }: { place: PlaceId; plane: PlaneArt }) {
  const gid = groupId(place, plane.id);
  return (
    <g id={gid}>
      {plane.parts.map((p, i) => {
        const style = p.op != null ? { opacity: p.op } : undefined;
        if (!PAPER.test(p.cls)) return <path key={i} d={p.d} className={p.cls} style={style} />;
        const pid = `${gid}-${i}`;
        return (
          <Fragment key={i}>
            <defs>
              <path id={pid} d={p.d} />
            </defs>
            <use href={`#${pid}`} className={p.cls} style={style} />
            <use href={`#${pid}`} className="fk-sand" />
          </Fragment>
        );
      })}
    </g>
  );
}

/**
 * One hidden <svg>: every place's planes and the fringe, referenced by the stage and the plates with <use>. It is an
 * island (Island.tsx): its inside, drawn here once per process as HTML (staticHtml.ts, every path compacted and a path
 * drawn twice used again), is in the page's HTML and never in the RSC payload — the world's paper travels once.
 */
const defsIslands = new Map<Look, string>();
export function WorldDefs({ look = 'waves' }: { look?: Look }) {
  let id = defsIslands.get(look);
  if (!id) {
    // the lab's comparison (`peaks`: script/look.ts) is an island of its own
    id = islandHtml(look === 'waves' ? 'film-world-defs' : `film-world-defs-${look}`, toHtml(<WorldDefsArt look={look} />, { path: compactPath }, true));
    defsIslands.set(look, id);
  }
  return <Island id={id} as="svg" className={styles.defs} aria-hidden="true" focusable="false" width="0" height="0" />;
}

/** The hidden <svg>'s inside (the island's HTML). */
function WorldDefsArt({ look }: { look: Look }) {
  return (
    <>
      <style>{PAINTS}</style>
      <defs>
        {PLACES.map((place) => placeArt(place, look).planes.filter((plane) => !plane.src).map((plane) => <PlaneGroup key={`${place}-${plane.id}`} place={place} plane={plane} />))}
        {PLACES.map((place) => (
          <CutClips key={place} place={place} look={look} />
        ))}
        {REST_PLACES.map((place) => (
          <RestClips key={place} place={place} look={look} />
        ))}
        <g id="film-fringe-l">
          <path d={fringeArt('left')} className="ff-fringe" />
        </g>
        <g id="film-fringe-r">
          <path d={fringeArt('right')} className="ff-fringe" />
        </g>
        {/* the paper's sand (script/sand.ts): one tile of fine grit, dark and pale, each paper is
            filled with a second time (PlaneGroup's `.fk-sand`) and the sky once (Sky) */}
        <pattern id="film-sand" width={SAND_TILE} height={SAND_TILE} patternUnits="userSpaceOnUse">
          <image href={pictureSrc(sandDark)} width={SAND_TILE} height={SAND_TILE} />
          <image href={pictureSrc(sandLight)} width={SAND_TILE} height={SAND_TILE} />
        </pattern>
        <radialGradient id="film-glow" r="0.5" cx="0.5" cy="0.5">
          {/* the sun (and the moon) into the sky: one soft gradient from the disc's edge (0.18 of the way) out — no rings
              (round 5, the owner: 「太陽這邊和天空做個漸層就好了，不要用這個很多圈的設計」) */}
          <stop offset="0" stopColor="var(--film-c-halo)" stopOpacity="0.8" />
          <stop offset="0.18" stopColor="var(--film-c-halo)" stopOpacity="0.62" />
          <stop offset="0.32" stopColor="var(--film-c-halo)" stopOpacity="0.36" />
          <stop offset="0.52" stopColor="var(--film-c-halo)" stopOpacity="0.16" />
          <stop offset="0.76" stopColor="var(--film-c-halo)" stopOpacity="0.05" />
          <stop offset="1" stopColor="var(--film-c-halo)" stopOpacity="0" />
        </radialGradient>
        {/* the lighthouse's lamp at night: a warm light, brightest at the glass, fading into the dark */}
        <radialGradient id="film-lamp-glow" r="0.5" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="oklch(96% 0.07 88)" stopOpacity="0.95" />
          <stop offset="0.12" stopColor="oklch(90% 0.12 80)" stopOpacity="0.7" />
          <stop offset="0.38" stopColor="oklch(82% 0.13 68)" stopOpacity="0.24" />
          <stop offset="1" stopColor="oklch(78% 0.12 62)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="film-lantern-glow" r="0.5" cx="0.5" cy="0.5">
          <stop offset="0" stopColor="var(--film-c-accent)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--film-c-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
    </>
  );
}

/* ───────────── the sky layer ───────────── */

function starsPath(): { dots: string; glints: string; twinkle: string[] } {
  const r = rng(808);
  let dots = '';
  let glints = '';
  const twinkle: string[] = [];
  for (let i = 0; i < 150; i++) {
    const x = r() * 1600;
    const y = Math.pow(r(), 1.4) * 540;
    const s = 0.7 + r() * r() * 2.2;
    r();
    dots += `M${x.toFixed(0)},${(y - s).toFixed(1)}a${s.toFixed(1)},${s.toFixed(1)} 0 1 0 .1,0Z`;
    if (s > 2.2 && r() < 0.75) {
      const q = s * 3.6;
      const w = s * 0.65;
      const star = `M${x.toFixed(0)},${(y - q).toFixed(0)}Q${(x + w).toFixed(0)},${(y - w).toFixed(0)} ${(x + q).toFixed(0)},${y.toFixed(0)}Q${(x + w).toFixed(0)},${(y + w).toFixed(0)} ${x.toFixed(0)},${(y + q).toFixed(0)}Q${(x - w).toFixed(0)},${(y + w).toFixed(0)} ${(x - q).toFixed(0)},${y.toFixed(0)}Q${(x - w).toFixed(0)},${(y - w).toFixed(0)} ${x.toFixed(0)},${(y - q).toFixed(0)}Z`;
      if (twinkle.length < 6) twinkle.push(star);
      else glints += star;
    }
  }
  return { dots, glints, twinkle };
}

export function Sky() {
  const st = starsPath();
  return (
    <>
      <div className={styles.sky} data-sky="">
        {/* the sky's share of the paper's sand: the same tile, in the world's units */}
        <svg className={styles.skySand} viewBox="0 0 2800 1400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <rect width="2800" height="1400" fill="url(#film-sand)" />
        </svg>
      </div>
      <svg className={styles.stars} viewBox="0 0 1600 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <path d={st.dots} className={styles.starDots} />
        <path d={st.glints} className={styles.starGlint} />
        {st.twinkle.map((d, i) => (
          <path key={i} d={d} className={styles.starGlint} data-twinkle="" style={{ animationDelay: `${-i * 0.9}s` } as CSSProperties} />
        ))}
      </svg>
    </>
  );
}

/** The disc at a nominal radius of 100 (the director scales and places it): its glow (one gradient into the sky), the sun's flat disc, the moon and its crescent. */
export function Disc() {
  const sun = path(tear(ellipse(0, 0, 100, 100, 64), 312, { jag: 1.2, wander: 5 }), true, 0);
  const outer = path(tear(ellipse(0, 0, 100, 100, 56), 310, { jag: 1, wander: 4 }), true, 0);
  // the terminator: an ellipse as tall as the moon, its width the phase's (film.module.css, --film-crescent), torn gently
  const term = path(tear(ellipse(0, 0, 108, 108, 56), 311, { amp: 0.6, jag: 0.6, wander: 1.6 }), true, 0);
  return (
    <div className={styles.disc} data-disc="" aria-hidden="true">
      <svg viewBox="-560 -560 1120 1120" focusable="false">
        <circle r="550" fill="url(#film-glow)" className={styles.discGlow} />
        <g className={styles.sun}>
          <path d={sun} className={styles.discFace} />
        </g>
        <g className={styles.moon}>
          {/* one moon waning as a moon does (--film-crescent 0 → 1): its lit half, and the terminator — an ellipse whose
              width is the phase's — adding light past the middle while it is gibbous (convex, never a bite), then
              taking it from the lit half for the crescent */}
          <mask id="film-cres">
            <rect x="-560" y="-560" width="1120" height="1120" fill="#000" />
            <rect x="-560" y="-560" width="560" height="1120" fill="#fff" />
            <path d={term} fill="#fff" className={styles.moonGibbous} />
            <path d={term} fill="#000" className={styles.moonCrescent} />
          </mask>
          <path d={outer} className={styles.discFace} mask="url(#film-cres)" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Tissue clouds: puffs by day, torn streaks at a low sun (each set's opacity is the hour's). A puff is one piece of
 * paper (round 5, the owner: 「雲朵也不要疊很多層…一朵一朵的這種雲，它一層就好了」): its bumps and its base one path,
 * one fill — no copies laid over it for shading.
 */
export function Clouds() {
  const puffs: string[] = [];
  for (const [cx, cy, w, sd] of [[250, 170, 330, 1], [690, 112, 240, 2], [1000, 290, 300, 3], [1470, 390, 240, 4]]) {
    const r = rng(600 + sd);
    const n = 4 + Math.floor(r() * 2);
    const bumps: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const rr = (w / n) * (0.75 + r() * 0.45) * (1 - Math.abs(u - 0.5) * 0.7);
      bumps.push([cx - w / 2 + w * u + (r() - 0.5) * 10, cy - rr * 0.45, rr]);
    }
    puffs.push(
      bumps.map(([x, y, rr], i) => path(tear(ellipse(x, y, rr, rr * 0.82, 22), sd * 50 + i, { jag: 0.9, wander: 2.5 }), true, 0)).join('') +
        path(tear([[cx - w / 2, cy - 14], [cx + w / 2, cy - 14], [cx + w / 2, cy], [cx - w / 2, cy]] as Pt[], sd * 50 + 9, { jag: 0.8, wander: 2 }), true, 0),
    );
  }
  const streaks: string[] = [];
  for (const [cx, cy, w, h] of [[340, 430, 560, 11], [1240, 392, 440, 8], [760, 484, 700, 10], [1400, 500, 380, 7], [160, 510, 320, 6]]) {
    const line: Pt[] = [];
    for (let x = cx - w / 2; x <= cx + w / 2; x += 12) line.push([x, cy + Math.sin((x - cx) / 90) * 3]);
    streaks.push(path(tear(ribbon(line, h * 2, 0.35), 700 + cx, { jag: 0.6, wander: 2 }), true, 0));
  }
  // a tall screen's own two tissue strips across the middle of its sky (the wide composition's are cropped away there)
  const strip = (w: number, h: number, seed: number) => {
    const line: Pt[] = [];
    for (let x = 6; x <= w - 6; x += 10) line.push([x, h / 2 + Math.sin(x / 70 + seed) * 2.2]);
    return path(tear(ribbon(line, h * 0.7, 0.4), 760 + seed, { jag: 0.6, wander: 2 }), true, 0);
  };
  return (
    <div className={styles.clouds} data-clouds="" aria-hidden="true">
      <svg className={styles.cloudsTall} viewBox="0 0 600 120" preserveAspectRatio="none" focusable="false">
        <path d={strip(560, 22, 1)} transform="translate(0 6)" className={styles.streak} />
        <path d={strip(420, 16, 2)} transform="translate(170 80)" className={styles.streak} style={{ opacity: 0.6 }} />
      </svg>
      <svg viewBox="0 0 1600 560" preserveAspectRatio="xMidYMax slice" focusable="false">
        <g className={styles.puffs}>
          {puffs.map((d, i) => (
            <path key={i} d={d} className={styles.cloudFront} />
          ))}
        </g>
        <g className={styles.streaks}>
          {streaks.map((d, i) => (
            <path key={i} d={d} className={styles.streak} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ───────────── the puppets standing still ───────────── */

const STILLS: Record<PalSlug, Still> = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)])) as Record<PalSlug, Still>;
/** Where each puppet's ground point is across its still's frame (the rig's `ground` x). */
const GROUND_X: Record<PalSlug, number> = Object.fromEntries(
  MASCOT_CAST.map((c) => {
    const ps = c.manifest.parts;
    const x0 = Math.min(...ps.map((p) => p.x));
    const x1 = Math.max(...ps.map((p) => p.x + p.w));
    return [c.slug, (c.manifest.ground[0] - x0) / (x1 - x0)];
  }),
) as Record<PalSlug, number>;

export const stillFor = (slug: PalSlug) => STILLS[slug];
/** Each still again with its arms drawn last: in front of its body (script/beats.ts ARMS_FRONT). */
const ARMS_IN_FRONT: Record<PalSlug, Still> = Object.fromEntries(
  Object.entries(STILLS).map(([slug, st]) => [slug, { ...st, parts: [...st.parts.filter((p) => !p.arm), ...st.parts.filter((p) => p.arm)] }]),
) as Record<PalSlug, Still>;

/**
 * A puppet standing at world x on a plane whose own x starts at x0 (the director moves it by --ax / --ay). The wide and
 * tall layouts' marks differ only in the last scene: CSS picks one until the director takes over.
 */
export function ActorStill({ slug, scene, at, x0, phase, carrier }: { slug: PalSlug; scene: SceneN | 'carrier'; at: { wide: [number, number]; tall: [number, number] }; x0: number; phase: number; carrier?: boolean }) {
  // who handles a card in this scene stands with both arms in front of its body, as its live puppet will (ARMS_FRONT)
  const front = scene !== 'carrier' && !!ARMS_FRONT[scene]?.includes(slug);
  return (
    <span
      className={carrier ? styles.carrierActor : styles.actor}
      data-actor={`${scene}:${slug}`}
      style={
        {
          '--ax-wide': (at.wide[0] - x0).toFixed(1),
          '--ay-wide': at.wide[1].toFixed(1),
          '--ax-tall': (at.tall[0] - x0).toFixed(1),
          '--ay-tall': at.tall[1].toFixed(1),
          '--gx': GROUND_X[slug].toFixed(4),
        } as CSSProperties
      }
    >
      <StillView still={front ? ARMS_IN_FRONT[slug] : STILLS[slug]} phase={phase} eyes={slug === 'night' && scene === 3 ? 'sleepy' : 'open'} waveArm={slug === 'card' ? 'r' : 'l'} lazy={scene !== 1} />
    </span>
  );
}

/* ───────────── the scene sets ───────────── */

/** A plane of a set: its <use> of the place's group, sized in world units by the stage's --u. */
function Plane({ place, plane, look, children }: { place: PlaceId; plane: PlaneArt; look: Look; children?: React.ReactNode }) {
  const back = plane.depth < 0.35;
  const src = plane.src ?? place;
  const href = `#${groupId(src, plane.id)}`;
  // a flat may carry an apron of its own paper under its torn foot (a scene change's `apron` foot: no sea or sky ever
  // shows under it) — shown only when the change's style asks for it (`data-foot-mode`)
  const apron = !back && plane.id !== 'bridge';
  // its cut-out foot (a change's `cut`): the clip each <use> wears then, and the foot's samples for the runtime
  const tallArt = plane.tall ? placeArt(plane.tall, look).planes.find((p) => p.id === plane.id) : undefined;
  const ys = cutSamples(plane);
  const ysTall = tallArt ? cutSamples(tallArt) : null;
  const cut = ys ? cutId(src, plane.id) : undefined;
  const cutTall = plane.tall && ysTall ? cutId(plane.tall, plane.id) : undefined;
  // its silhouette at rest (a change's `rest`), where its place has one
  const rest = !plane.tall && REST_PLACES.includes(place) && REST_PLANES.includes(plane.id) && !!plane.edges?.length ? restId(place, plane.id) : undefined;
  const uses = plane.tall ? (
    <>
      <use href={href} className="art-wide" data-cut={cut} />
      <use href={`#${groupId(plane.tall, plane.id)}`} className="art-tall" data-cut={cutTall} />
    </>
  ) : (
    <use href={href} data-cut={cut} data-rest={rest} />
  );
  return (
    <div
      className={styles.plane}
      data-plane={plane.id}
      data-back={back ? '' : undefined}
      data-x0={plane.x0}
      data-d={plane.depth}
      data-foot={plane.foot}
      data-cut-ys={ys ? `${CUT_STEP}:${ys.join(',')}` : undefined}
      data-cut-ys-tall={ysTall ? `${CUT_STEP}:${ysTall.join(',')}` : undefined}
      style={{ '--x0': plane.x0, '--pw': plane.w, '--d': plane.depth } as CSSProperties}
    >
      {apron && <span className={styles.apron} style={{ '--apron-top': plane.foot - 40, backgroundColor: `var(--film-c-${plane.id})` } as CSSProperties} />}
      <svg viewBox={`${plane.x0} 0 ${plane.w} 1400`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {uses}
      </svg>
      {plane.id !== 'sea' && (
        // the same paper again, every paint the haze's (a change's `haze`: a flat flown away pales into the sky, opaque)
        <svg className={styles.haze} data-haze="" style={back ? ({ '--film-c-fly': 'var(--film-c-fly-low)' } as CSSProperties) : undefined} viewBox={`${plane.x0} 0 ${plane.w} 1400`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {uses}
        </svg>
      )}
      {plane.id === 'sea' && (
        // the disc's reflection, cut in strips (the director keeps it under the sun or the moon)
        <svg className={styles.reflect} data-reflect="" viewBox="-160 0 320 110" aria-hidden="true" focusable="false">
          {reflectStrips()}
        </svg>
      )}
      {children}
    </div>
  );
}

function reflectStrips() {
  const rs = rng(41);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < 10; i++) {
    const y = 5 + i * 8.5 + rs() * 3;
    const w = 150 * (1 - i * 0.07) * (0.55 + rs() * 0.5);
    const x = (rs() - 0.5) * 34;
    out.push(<path key={i} d={path(tear(ribbon([[x - w / 2, y], [x, y + 0.5], [x + w / 2, y]], 3.4), 430 + i, { jag: 0.4, wander: 0.6 }), true, 1)} className={styles.reflectStrip} style={{ opacity: 1 - i * 0.075 }} />);
  }
  return out;
}

/** The four scene sets (only the current one, and the incoming during a change, is shown). */
export function Sets({ phase = 0, look = 'waves' }: { phase?: number; look?: Look }) {
  const scenes: SceneN[] = [1, 2, 3, 4];
  return (
    <div className={styles.sets} aria-hidden="true">
      {scenes.map((n) => {
        const place = PLACE_OF[n];
        const art = placeArt(place, look);
        const ground = art.planes.find((p) => p.id === 'ground')!;
        return (
          <div key={n} className={styles.set} data-set={n} data-place={place}>
            {art.planes.map((plane) => (
              <Plane key={plane.id} place={place} plane={plane} look={look}>
                {plane.id === 'ground' &&
                  CAST_OF[n].map((slug, i) => {
                    const xw = markOf(n, slug, 'wide');
                    const xt = markOf(n, slug, 'tall');
                    return (
                      <ActorStill
                        key={slug}
                        slug={slug}
                        scene={n}
                        at={{ wide: [xw, groundAt(place, xw)], tall: [xt, groundAt(place, xt)] }}
                        x0={ground.x0}
                        phase={phase + i * 1.3 + n * 0.7}
                      />
                    );
                  })}
              </Plane>
            ))}
            <svg className={styles.fringeL} viewBox="0 0 420 330" preserveAspectRatio="xMinYMax meet" aria-hidden="true" focusable="false" data-fringe="l" style={{ '--d': FRINGE_DEPTH } as CSSProperties}>
              <use href="#film-fringe-l" />
            </svg>
            <svg className={styles.fringeR} viewBox="0 0 420 330" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false" data-fringe="r" style={{ '--d': FRINGE_DEPTH } as CSSProperties}>
              <use href="#film-fringe-r" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/** Where a set's plane of an id is, for the runtime (depth, extent) — the same numbers the CSS uses. */
export const planeExtents = () =>
  Object.fromEntries(PLACES.map((p) => [p, placeArt(p).planes.map((pl) => ({ id: pl.id, depth: pl.depth, x0: pl.x0, w: pl.w }))]));

/* ───────────── the particles ───────────── */

/** The wind ≋ (three tapered ribbons whose pen streams with the film), five paper birds, nine lanterns, twelve fireflies. */
export function Particles() {
  const r = rng(909);
  // folded paper birds: two wings creased at the body, the lit one paler, and a small folded tail
  const dark: string[] = [];
  const lit: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = i * 30 + (r() - 0.5) * 26;
    const y = Math.abs(i - 2) * 12 + (r() - 0.5) * 12;
    const s = 0.9 + r() * 0.5;
    const up = (5 + r() * 6) * s;
    const f = (v: number) => v.toFixed(1);
    lit.push(`M${f(x - 0.6)},${f(y)}L${f(x - 12 * s)},${f(y - up)}L${f(x - 4 * s)},${f(y + 2.4 * s)}Z`);
    dark.push(`M${f(x + 0.6)},${f(y)}L${f(x + 12 * s)},${f(y - up * 0.82)}L${f(x + 4 * s)},${f(y + 2.4 * s)}Z`);
    dark.push(`M${f(x - 2.2 * s)},${f(y + 1.6 * s)}L${f(x + 2.2 * s)},${f(y + 1.6 * s)}L${f(x + 0.4 * s)},${f(y + 6 * s)}Z`);
  }
  const lantern = path(tear([[-5, -7], [5, -7], [6.5, 6], [-6.5, 6]] as Pt[], 520, { jag: 0.25, wander: 0.3 }), true, 1);
  const flame = path(ellipse(0, 1, 3, 4.5, 12), true, 1);
  return (
    <div className={styles.particles} aria-hidden="true">
      <svg className={styles.wind} data-wind="" viewBox="0 0 1000 400" preserveAspectRatio="none" focusable="false">
        {[0, 1, 2].map((i) => (
          <path key={i} data-ribbon={i} className={styles.windRibbon} pathLength={1} />
        ))}
      </svg>
      <svg className={styles.birds} data-birds="" viewBox="-30 -30 180 70" focusable="false">
        <path d={dark.join('')} className={styles.bird} />
        <path d={lit.join('')} className={styles.birdLit} />
      </svg>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={styles.lantern} data-lantern={i}>
          <svg viewBox="-24 -24 48 48" focusable="false">
            <circle r="24" fill="url(#film-lantern-glow)" />
            <path d={lantern} className={styles.lanternPaper} />
            <path d={flame} className={styles.lanternFlame} />
          </svg>
        </span>
      ))}
      <div className={styles.fireflies} data-fireflies="">
        {Array.from({ length: 12 }, (_, i) => {
          const q = rng(1700 + i);
          return <i key={i} style={{ left: `${(8 + q() * 84).toFixed(1)}%`, top: `${(52 + q() * 34).toFixed(1)}%`, animationDelay: `${(-q() * 6).toFixed(2)}s`, animationDuration: `${(5 + q() * 4).toFixed(2)}s` } as CSSProperties} />;
        })}
      </div>
    </div>
  );
}
