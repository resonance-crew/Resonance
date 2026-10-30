/**
 * 牽牽's tab icon: its head as the kit's default icon draws one (the bow, the eyelet, the eyes, a little blush), but
 * cropped a little higher, so it stops just above the brads its arms are pinned on — at 96 px those two gold dots at the
 * bottom corners read as buttons, not as 牽牽.
 */
import { defineSticker, SIZE } from '../kit';

/** The crop, rig units: wide enough for the eyes well inside it (as the default), its foot just above the brads. */
const HALF = 136;
const BOTTOM = 382;
/** The face's middle (between the eyes) and the rig's ground point. */
const FX = 349.7;
const GROUND: [number, number] = [350, 700];

const K = (SIZE / 2 - 8) / HALF;
const CY = BOTTOM - HALF;

export default defineSticker({
  duration: 1 / 12,
  hero: 0,
  cast: { tw: { slug: 'tag', x: SIZE / 2 - (FX - GROUND[0]) * K, ground: SIZE / 2 + (GROUND[1] - CY) * K, k: K } },
  frame(_t, { tw }) {
    tw.pose.blush = 0.35;
    tw.pose.liftL = 0;
    tw.pose.liftR = 0;
  },
});
