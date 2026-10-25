import styles from './BrandMark.module.css';

/**
 * The platforms' own marks, for the web share menu's rows (molecules/ShareMenu):
 * LINE, Threads, Facebook, X — each brand's official monochrome mark,
 * unmodified, in near-black ink (no brand may be recoloured, so never the
 * terracotta of the hand-drawn icons beside them).
 *
 * Where the paths come from: each brand's centre gives its files only to
 * someone who accepts its terms (LINE's logo guidelines, line.me/en/logo;
 * Meta's brand resources for the Facebook "f" and Threads; X's brand
 * toolkit, about.x.com), so the same marks are taken from Simple Icons
 * 16.35.0 (simple-icons.org; its files are CC0, and its data names each
 * brand's own page as the mark's source and guidelines), copied verbatim —
 * the path of icons/{line,threads,facebook,x}.svg. They are trademarks of
 * their owners, used here only to name the platform a row shares to (each
 * brand's guidelines still govern how; the owner reviews them). BrandMark.test.tsx
 * pins a hash of each path: changing one is a deliberate act, never a tidy-up.
 *
 * Deliberately not in the Icon registry (SKILL.md rule 2's one exception):
 * these aren't hand-drawn and aren't ours to redraw, they are filled shapes
 * at the brands' own geometry, and the apps never draw them (their system
 * share sheet shows the apps' real icons) — so `apps:generate` and the
 * icons' absolute-path check never see them.
 */
export type BrandName = 'line' | 'threads' | 'facebook' | 'x';

/** Each mark's one path, on Simple Icons' 24 × 24 grid. */
export const BRAND_PATHS: Record<BrandName, string> = {
  line:
    'M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314',
  threads:
    'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z',
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  x:
    'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
};

/**
 * Room kept round each mark inside its box, in grid units: the marks fill
 * their 24 grid edge to edge, while the hand-drawn icons beside them leave
 * most of theirs to the paper, so at the same box a mark read twice their
 * size. Padded, a mark draws about 14.5 px of a 17 px slot — X too (round 12
 * §4: with more room it drew 13.3 and read a size smaller than the rest).
 */
const INSET: Record<BrandName, number> = { line: 2, threads: 2, facebook: 2, x: 2 };

export interface BrandMarkProps {
  name: BrandName;
  /** Its box, in px (the menu's icon slot is 17). */
  size?: number;
}

/** A brand's mark, filled with the ink around it; decorative — the row it sits in names the platform. */
export function BrandMark({ name, size = 17 }: BrandMarkProps) {
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox={`${-INSET[name]} ${-INSET[name]} ${24 + 2 * INSET[name]} ${24 + 2 * INSET[name]}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-brand={name}
    >
      <path d={BRAND_PATHS[name]} />
    </svg>
  );
}
