import { notFound } from 'next/navigation';

/**
 * Every path under a locale that names no page: the locale's own not-found
 * page (../not-found.tsx), inside the locale's layout — so it wears the
 * reader's theme and scheme, which Next's bare default page never could.
 */
export default function UnknownPage(): never {
  notFound();
}
