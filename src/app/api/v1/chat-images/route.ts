import { NextResponse } from 'next/server';
import { spend } from '@/lib/api/rateLimit';
import { keptChatImage, uploadChatImage } from '@/lib/api/v1/chatImageUpload';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { ChatImageUploadForm } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILE_BYTES } from '@/lib/images/limits';
import { getChatImageStore } from '@/lib/storage/chatImages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Two re-encodes of a picture of up to 4 MB.
export const maxDuration = 30;

const tooLarge = () => new ApiFailure('invalid_request', 'The picture is too large.');

/**
 * POST /api/v1/chat-images — keep a picture to send in a conversation
 * (multipart: `file`, `to`, `clientId`), answered with its id for
 * POST /api/v1/messages `image` (lib/api/v1/chatImageUpload). Nothing the
 * client says about the file is trusted: it is decoded and written again.
 */
export const POST = withUser(async (user, req) => {
  // Refused before the body is read; a body sent without a length is checked once parsed.
  if (Number(req.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) throw tooLarge();
  const db = getAdminDb();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) {
    throw new ApiFailure('invalid_request', 'A picture is needed.', [{ path: 'file', message: 'Required' }]);
  }
  if (file.size > UPLOAD_MAX_FILE_BYTES) throw tooLarge();
  const fields = parse(ChatImageUploadForm, { to: form.get('to'), clientId: form.get('clientId') || null });
  // A resend of a picture already kept (the outbox's retry after a lost answer) costs nothing.
  const kept = fields.clientId ? await keptChatImage(db, user.id, fields.to, fields.clientId) : null;
  if (kept) return NextResponse.json(kept, { status: 201 });
  const store = getChatImageStore();
  if (!store) throw new ApiFailure('internal', "Pictures can't be sent right now.");
  await spend(db, user.id, 'chatImage');
  await spend(db, user.id, 'chatImageBytes', file.size);
  const uploaded = await uploadChatImage(db, store, user.id, {
    to: fields.to,
    clientId: fields.clientId,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return NextResponse.json(uploaded, { status: 201 });
});
