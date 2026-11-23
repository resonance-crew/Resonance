/**
 * How a capture runs: these phases one after the other, the platforms of a phase side by side —
 * the web's headless browser beside the Mac app, then the two AVDs together, then the two
 * simulators together (each platform runs its own devices at once: VISUAL_PARALLEL=0 runs them one
 * at a time). Each phase frees its devices before the next boots.
 */
import type { Platform } from './screens';

export const PHASES: Platform[][] = [['web', 'mac'], ['android'], ['ios']];

/** The platforms whose app is built before it is captured. */
const BUILT: Platform[] = ['mac', 'android', 'ios'];

/**
 * The order the run starts its apps' builds in, as the run starts: the order their phases come. The two Xcode builds
 * take turns (ios.ts `inXcodeLine`, first come first built), so the Mac's, wanted in the first phase, goes ahead of
 * the simulator's, wanted in the last (the simulator's used to go first: run 20261123-053155's Mac waited 4 min behind
 * it with nothing captured). Gradle's runs beside them.
 */
export function buildOrder(platforms: readonly Platform[]): Platform[] {
  return PHASES.flat().filter((p) => BUILT.includes(p) && platforms.includes(p));
}
