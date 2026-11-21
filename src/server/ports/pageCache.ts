/**
 * The cached (ISR) pages. Paths are logical (`/card/x`, `/u/name`, `/`): the
 * adapter drops each in every locale, and the sitemap with the landing page
 * (src/lib/api/revalidate.ts revalidateLocalized). Which paths a change
 * touches stays pure (cardPagePaths, landingPagePaths, profilePagePaths).
 */
export interface PageCache {
  /** Drop these pages; answers the concrete paths dropped. */
  revalidate(paths: Iterable<string>): string[];
}
