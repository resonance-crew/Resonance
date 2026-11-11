import { MASCOT_CAST } from '@/lib/mascots/cast.generated';
import { stillOf, type PalSlug, type Still } from '@/lib/mascots/pals/still';

/** The five as the server draws them standing still (PaperPalStill), from the stage's own part images. */
export const STILLS = Object.fromEntries(MASCOT_CAST.map((c) => [c.slug, stillOf(c)])) as Record<PalSlug, Still>;
