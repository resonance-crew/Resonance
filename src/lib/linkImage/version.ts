/**
 * A short tag for what a share image shows (FNV-1a, twice): the image's URL
 * carries it (`?v=`), so a new cover, photo or drawing is a new URL no cache
 * answers from the old one.
 */
export function imageVersion(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x0100019d) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}
