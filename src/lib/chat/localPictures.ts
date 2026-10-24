/**
 * The pictures sent from this page, by their id (the id the server keeps them
 * under is the message's client id): the thread draws a picture the reader
 * just sent from the device — while it goes up, and after, when the
 * conversation's own message replaces the one on its way — never waiting to
 * read back what is already here. Kept for the page's life.
 */
const pictures = new Map<string, string>();

/** Keep `blob` to draw as picture `id`; answers where it is drawn from. */
export function keepLocalPicture(id: string, blob: Blob): string {
  const known = pictures.get(id);
  if (known) return known;
  const url = URL.createObjectURL(blob);
  pictures.set(id, url);
  return url;
}

/** Where picture `id` is drawn from on this device, if it was sent from here. */
export function localPicture(id: string): string | undefined {
  return pictures.get(id);
}
