import { apiError, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getChatImageStore } from '@/lib/storage/chatImages';
import { serverCtx } from '@/server/ctx';
import { streamChatImageIn } from '@/server/app/chatImages';

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
  // Handed on as it arrives from the store (B14), never held whole in the function.
  const body = store ? await streamChatImageIn(serverCtx({ chatObjects: store }), user.id, id, size) : null;
  if (!body) return apiError('not_found', 'No such picture.');
  return new Response(body instanceof ReadableStream ? body : new Blob([new Uint8Array(body)], { type: 'image/webp' }), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=31536000, immutable',
      Vary: 'Authorization, Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
