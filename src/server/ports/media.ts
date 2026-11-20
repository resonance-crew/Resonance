/**
 * Where our public pictures are served from (src/lib/storage/publicUrl.ts):
 * the current base, where new ones go, then former bases that still serve
 * the same keys. Pure — no storage client — so metadata code may ask it.
 */
export interface MediaUrlResolver {
  /** The public URL of a key, on the current base. */
  publicUrl(key: string): string;
  /** The key behind one of our URLs (any of our bases), or null for anything else. */
  keyOf(url: string | null | undefined): string | null;
  /** Whether the URL is one of our pictures. */
  isOurs(url: string | null | undefined): boolean;
  /** Every base, the current first; empty when the server knows none. */
  bases(): string[];
}
