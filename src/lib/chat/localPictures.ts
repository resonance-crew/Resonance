/**
 * The pictures sent from this page, by their id (the id the server keeps them
 * under is the message's client id): the thread draws a picture the reader
 * just sent from the device — while it goes up, and after, when the
 * conversation's own message replaces the one on its way — never waiting to
 * read back what is already here. The newest {@link LOCAL_PICTURES_MAX} are
 * kept (W17: each up to a few MB, held for the page's life before); an older
 * one is let go (its object URL revoked) and drawn from the server's copy,
 * as anyone else's picture is.
 */
const pictures = new Map<string, string>();

/** How many pictures sent from this page stay drawn from the device. */
export const LOCAL_PICTURES_MAX = 24;

/** Keep `blob` to draw as picture `id`; answers where it is drawn from. */
export function keepLocalPicture(id: string, blob: Blob): string {
  const known = pictures.get(id);
  if (known) return known;
  const url = URL.createObjectURL(blob);
  pictures.set(id, url);
  // The Map keeps its keys in the order they came: the first is the oldest.
  while (pictures.size > LOCAL_PICTURES_MAX) {
    const [oldest, oldUrl] = pictures.entries().next().value as [string, string];
    pictures.delete(oldest);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

/** Where picture `id` is drawn from on this device, if it was sent from here (and is among the newest kept). */
export function localPicture(id: string): string | undefined {
  return pictures.get(id);
}
