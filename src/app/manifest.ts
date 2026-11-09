import type { MetadataRoute } from 'next';
import { PLAY_PACKAGE, PLAY_STORE_URL } from '@/lib/appStores';

/**
 * /manifest.webmanifest, linked from every page (the root segment's metadata route). Not an installable web app —
 * `display: browser`, no `display_override`, so no browser offers to install the site (09c30a9c took the PWA away):
 * it names the Android app instead (round 23 §6, the owner: 「希望是系統的那一種」), so Chrome on Android may offer
 * that with its own prompt — when its model decides, never a banner of ours. Chrome takes the app's name and icon from
 * Google Play; the name and icons here are for whatever else reads a manifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Resonance',
    short_name: 'Resonance',
    start_url: '/',
    display: 'browser',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    related_applications: [{ platform: 'play', id: PLAY_PACKAGE, url: PLAY_STORE_URL }],
    prefer_related_applications: true,
  };
}
