import { createHash } from 'node:crypto';

/** What a kept translation of a story was made from: the card's title and story as they were (`cards/{id}/translations/{to}.hash`). */
export function translationHash(title: string, story: string): string {
  return createHash('sha256').update(JSON.stringify([title, story])).digest('base64url');
}
