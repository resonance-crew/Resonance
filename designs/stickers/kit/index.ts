/**
 * The sticker kit: everything a choreography (designs/stickers/<pack>/<id>.ts) imports. See designs/stickers/README.md.
 */
export { defineSticker, iconSticker, SIZE, type PropDef, type StickerDef } from './scene';
export { MITTEN_MIDDLE, StickerPuppet, type ArmSide, type PuppetDef, type Slug, type Stance, type StickerPose } from './puppet';
export { CAST_COLOURS, Prop, PROP_KINDS, type PropAt, type PropKind, type PropState } from './props';
export { INK } from './paper';
export { bell, clamp, cycles, ease, env, FPS, fr, frameTimes, keys, lerp, smooth, snap, span, step, taps, type Ease } from './timeline';
export { blink, bow, breathe, hold, hop, lookAt, moved, nod, polar, reachTo, wave } from './poses';
