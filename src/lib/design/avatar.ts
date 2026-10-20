import { wobRect } from './wobRect';

/**
 * A hand-drawn avatar's geometry — HandDrawnAvatar's on the web, and the
 * link-preview image's (lib/linkImage/render), which draws the same avatar
 * without React's DOM. The apps' twins (HandDrawnAvatar on both) follow it.
 */

// Geometry shared between the initials border and the image clip so the picture
// fills exactly the same hand-drawn outline.
const AVATAR_WOB = {
  segmentsH: 1 as const,
  segmentsV: 1 as const,
  curve: 1.3,
  cornerJitter: 3.2,
};

/**
 * The exact wobbly outline of an avatar at a given size/seed. Exported so other
 * UI (e.g. a hover wash overlay) can clip itself to the same hand-drawn curve
 * instead of approximating it with border-radius.
 */
export function avatarWobPath(size: number, seed = 1): string {
  return wobRect(size, size, size * 0.4, seed, size * 0.022, {
    ...AVATAR_WOB,
    cornerOffset: size * 0.06,
  });
}

/** A character drawn a full em wide: CJK ideographs, kana, hangul, fullwidth forms. */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x20000
  );
}

/**
 * The initials' type size as a share of the avatar: 0.35, unless the letters would run wider
 * than 0.56 of it (a wide character counted as an em, any other as 0.62) — two Chinese
 * characters at 0.35 met the outline's curve with no paper beside them. The apps' twins
 * (Android HandDrawnAvatar, iOS HandDrawnAvatar) follow the same rule.
 */
export function initialsScale(initials: string): number {
  let ems = 0;
  for (const ch of initials) ems += isWide(ch.codePointAt(0)!) ? 1 : 0.62;
  return ems > 0 ? Math.min(0.35, 0.56 / ems) : 0.35;
}
