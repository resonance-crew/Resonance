/**
 * The scene changes' styles, picked by `?change=<name>` (the lab's switch; an unknown or missing name falls back to the
 * default, flats — the panel's choice). Each style lives in its own file: flats.ts ("the paper theatre", the film's),
 * and for the owner to compare, lift.ts ("the curtain"), mist.ts ("through the clouds") and legacy.ts (the change as
 * first built). The picture book (reduced motion) never runs a change, so no style reaches it.
 */
import { flats } from './flats';
import { legacy } from './legacy';
import { lift } from './lift';
import { mist } from './mist';
import type { ChangeStyle } from './types';

export type { ChangeStyle } from './types';

export const CHANGE_STYLES: Readonly<Record<string, ChangeStyle>> = { legacy, lift, mist, flats };
export const DEFAULT_CHANGE = 'flats';

/** The style of a name (`?change=`), or the default. */
export function changeStyleOf(name: string | null | undefined): ChangeStyle {
  return name && Object.prototype.hasOwnProperty.call(CHANGE_STYLES, name) ? CHANGE_STYLES[name] : CHANGE_STYLES[DEFAULT_CHANGE];
}
