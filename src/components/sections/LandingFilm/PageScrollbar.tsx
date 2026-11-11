'use client';

import { OrganicScrollbar } from '@/components/atoms/OrganicScrollbar/OrganicScrollbar';

/** The landing page's scrollbar: the site's drawn bar floating over the picture, shown while the page moves or its
 *  column is pointed at (script/scrollbar.ts). */
export function PageScrollbar() {
  return <OrganicScrollbar page autoHide seed={53} />;
}
