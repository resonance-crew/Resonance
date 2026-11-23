/**
 * The Instagram reels' stage (1080 × 1920): one reel per page load,
 * `?reel=likes|kept|write`. Like the tour (scripts/promo/page), the page is a
 * pure function of time and answers `window.__promo.renderAt(t)`, so
 * scripts/promo/render.ts renders it frame by frame. scripts/reels/make.ts
 * renders a reel, lays its sounds and music under it and writes the MP4.
 *
 * It reuses the tour's drawing kit (scripts/promo/page/kit.ts), so a reel draws
 * the app's own pieces from the same geometry and tokens.
 */
import { initDefs, initMeasure } from '../../promo/page/kit';
import { loadStickers } from './lib';
import { REELS } from './reels';
import { loadTheaterCast } from './theater';

declare global {
  interface Window {
    __promo: { ready: Promise<void>; duration: number; loopFrom: number; renderAt: (t: number) => void };
  }
}

const params = new URLSearchParams(location.search);
document.documentElement.lang = 'zh-TW';
const reel = REELS[params.get('reel') ?? 'likes'] ?? REELS.likes;
const stage = document.getElementById('stage')!;

async function loadFonts() {
  const text = reel.text + '0123456789·…⋯「」，。、：；！？ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz./・共振Resonance';
  const faces = ['Playfair Display', 'DM Sans', 'Noto Serif TC', 'Noto Sans TC'];
  const weights = [400, 500, 600, 700, 800];
  await Promise.all(faces.flatMap((f) => weights.map((w) => document.fonts.load(`${w} 40px "${f}"`, text))));
  await document.fonts.ready;
}

let update: (t: number) => void = () => {};

const ready = (async () => {
  initDefs(stage);
  initMeasure(stage);
  await Promise.all([loadFonts(), loadStickers(), reel.id.startsWith('theater') ? loadTheaterCast() : null]);
  const built = reel.build();
  stage.append(built.root);
  update = built.update;
  update(Number(params.get('t') ?? 0));
})();

window.__promo = { ready, duration: reel.duration, loopFrom: reel.duration, renderAt: (t) => update(t) };
