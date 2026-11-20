import { revalidateLocalized } from '@/lib/api/revalidate';
import type { PageCache } from '@/server/ports/pageCache';

/** Next's ISR cache: every locale's copy, and the sitemap with the landing page (revalidateLocalized). */
export const nextPageCache: PageCache = {
  revalidate: (paths) => revalidateLocalized(paths),
};
