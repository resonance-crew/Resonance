/**
 * 悄悄's paper outline (its torso, the rig's own body clip in designs/mascots/cast/night/rig.svg, every other point),
 * in rig units, and the torso image's box around it (the manifest's): the night's hole is cut to exactly this shape,
 * at 悄悄's own size, right above it — the place in the sky it was cut from.
 */
export const HUSH_TORSO_BOX = { x: 165, y: 293.75, w: 375, h: 317.5 } as const;

/** The torso's box in the still's frame, % of the frame's width (its parts' box: x 115 → 587.5). */
export const HUSH_TORSO_IN_FRAME = { left: 10.582, width: 79.365 } as const;

export const HUSH_OUTLINE =
  'M486,594 L510,585 L524,561 L527,520 L526,506 L522,494 L518,481 L518,468 L515,456 L510,444 L507,430 L500,418 L498,405 L492,394 L485,383 L480,372 L472,361 L463,352 L455,342 L446,333 L436,325 L425,319 L415,312 L404,308 L392,303 L379,302 L366,300 L353,300 L340,300 L328,301 L315,304 L302,307 L291,312 L280,316 L270,322 L259,329 L250,337 L240,346 L233,356 L224,367 L217,378 L211,388 L205,399 L199,411 L195,424 L190,437 L186,450 L183,462 L180,474 L176,486 L176,500 L172,513 L173,543 L180,576 L199,595 L220,594 L232,594 L244,594 L255,594 L267,595 L279,594 L291,595 L302,595 L314,595 L326,595 L338,595 L350,595 L362,595 L374,595 L385,595 L397,595 L409,595 L421,595 L433,594 L444,594 L456,594 L468,594 L480,594Z';
