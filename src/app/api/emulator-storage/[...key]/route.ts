import { againstEmulators, LocalStorageProvider, localContentType } from '@/lib/storage/local';
import { IMMUTABLE } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Larger than anything an upload stores (UPLOAD_MAX_BYTES before re-encoding). */
const MAX_BYTES = 16 * 1024 * 1024;

const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

/**
 * GET /api/emulator-storage/{key} — a picture stored against the emulators
 * (lib/storage/local): what R2's public host serves in production, from a
 * folder on this machine. Anywhere else — no emulators — it is a 404, so a
 * deployment never serves a file from its own disk.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (!againstEmulators()) return notFound();
  const key = (await ctx.params).key.join('/');
  // Our keys only (`{kind}/{yyyy-mm}/{uuid}.{ext}`): no empty, dot or dot-dot segment, a type we store.
  const type = localContentType(key);
  if (!type || !/^[A-Za-z0-9_.\-/]{1,512}$/.test(key) || key.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    return notFound();
  }
  const bytes = await new LocalStorageProvider().getObject(key, MAX_BYTES).catch(() => null);
  if (!bytes) return notFound();
  return new Response(new Blob([new Uint8Array(bytes)], { type }), {
    headers: { 'Content-Type': type, 'Cache-Control': IMMUTABLE, 'X-Content-Type-Options': 'nosniff' },
  });
}
