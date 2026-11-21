/**
 * The passages' dialog's timing (round 27 §U1), apart from the dialog itself so the card page can read it without
 * pulling the dialog (Modal, DialogScroll, its CSS) into its own chunk: TapPassages is loaded with `dynamic` on the
 * first open.
 */

/** How long a chosen row holds its ink and check before the dialog closes (§U1.5); at once under reduced motion. */
export const PASSAGE_CHOSEN_MS = 300;

/** Whether the reader asked for less motion (a test's jsdom has no matchMedia: motion as usual). */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
