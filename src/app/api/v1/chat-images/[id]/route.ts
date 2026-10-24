import { readChatImage } from '@/lib/api/v1/chatImages';
import { apiError, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { getChatImageStore } from '@/lib/storage/chatImages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/chat-images/{id}[?size=thumb] — a picture sent in one of the
 * viewer's conversations, for the two people in it while its message is
 * there (lib/api/v1/chatImages readChatImage); a 404 for anything else, never
 * saying why. Its bytes never change, so the viewer's own client keeps them
 * (`private`: never a shared cache).
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'id'>) => {
  const id = await routeParam(ctx, 'id');
  const size = new URL(req.url).searchParams.get('size') === 'thumb' ? 'thumb' : 'full';
  const store = getChatImageStore();
  const bytes = store ? await readChatImage(getAdminDb(), store, user.id, id, size) : null;
  if (!bytes) return apiError('not_found', 'No such picture.');
  return new Response(new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      Vary: 'Authorization, Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
