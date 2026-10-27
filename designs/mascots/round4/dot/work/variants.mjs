// The round-4 variants of the print on Pip's disc. Owner: the line and the writing are 太抢眼; their idea: the line a
// little higher and a second one below, the ink faded as on an old pad. Each entry is a DOT_VARIANT for gen/dot.mjs
// (this folder's copy); `v3` is round 3 as shipped. The paper (oklch 84.5% 0.106 95) is the same in all of them.
//   rules: ruleY of each printed line before the print is turned (tilt, about the disc's centre 350,567), so ruleY − 567
//   is the line's distance from the centre. The brads' lower edges are at 46.5 (right) and 36.3 (left) on that scale,
//   the face's lowest point (open mouth, slid down 8) at 13, the disc's edge at 98.
const FADED = { ruleColor: 'oklch(64% 0.045 232)', ruleW: 2.3, ruleOp: 0.6 };      // aged ink: lighter, greyer
const FADED_THIN = { ruleColor: 'oklch(60% 0.05 232)', ruleW: 1.7, ruleOp: 0.62 };  // the same strength, a finer line
export const VARIANTS = {
  v3: {},
  // A — round 1's strength of line and writing (pale rule 64% 0.055 235, 2.1 wide at 0.62; writing 0.27), round 3's paper
  a: { rules: [632], ruleColor: 'oklch(64% 0.055 235)', ruleW: 2.1, ruleOp: 0.62, word: { line: 0, x0: 281, dy: -1, s: 1.25, w: 1.4, op: 0.27 } },
  // B — the owner's idea as said: the line moved up 12 (just under the brads), a second 24 below (a ~5 cm craft punch
  // on a narrow-ruled pad), faded ink; the writing stays on the upper line
  b: { ...FADED, rules: [620, 644], word: { line: 0, x0: 284, dy: -1, s: 1.2, w: 1.4, op: 0.32 } },
  // C — B with the writing between the two lines, sitting on the lower one as handwriting does on a ruled page
  c: { ...FADED, rules: [620, 644], word: { line: 1, x0: 300, dy: -1, s: 1.2, w: 1.4, op: 0.32 } },
  c2: { ...FADED_THIN, rules: [620, 644], word: { line: 1, x0: 300, dy: -1, s: 1.2, w: 1.4, op: 0.32 } },
  // D — C plus the legal pad's red margin: a faint double line near the left edge
  d: { ...FADED, rules: [620, 644], word: { line: 1, x0: 300, dy: -1, s: 1.2, w: 1.4, op: 0.32 },
    margin: { x: 266, gap: 3.2, color: 'oklch(62% 0.13 22)', w: 1.1, op: 0.42 } },
  // E — three faint lines 19 apart (a bigger punch), the writing between the first two
  e: { ...FADED, ruleW: 1.8, ruleOp: 0.55, rules: [618, 637, 656], word: { line: 1, x0: 296, dy: -1, s: 1.05, w: 1.3, op: 0.3 } },
};
