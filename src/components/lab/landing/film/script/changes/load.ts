/**
 * The runtime's way to the scene changes' style: the film's own (flats) is in its bundle; the lab's others (`?change=`
 * lift, mist, legacy, for the owner to compare) are fetched only when the address asks for one, so the film never
 * carries them. An unknown name is the default. (index.ts keeps every style at hand for the tests.)
 */
import { flats } from './flats';
import type { ChangeStyle } from './types';

export const DEFAULT_STYLE: ChangeStyle = flats;

const OTHERS: Readonly<Record<string, () => Promise<ChangeStyle>>> = {
  lift: () => import('./lift').then((m) => m.lift),
  mist: () => import('./mist').then((m) => m.mist),
  legacy: () => import('./legacy').then((m) => m.legacy),
};

/** The style `?change=<name>` names (fetched if it is one of the lab's others), or the film's own. */
export async function loadChangeStyle(name: string | null | undefined): Promise<ChangeStyle> {
  if (!name || !Object.prototype.hasOwnProperty.call(OTHERS, name)) return DEFAULT_STYLE;
  try {
    return await OTHERS[name]();
  } catch {
    return DEFAULT_STYLE;
  }
}
