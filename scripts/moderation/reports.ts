/**
 * Moderation queue for reports (檢舉). Reports are write-only for clients, so
 * this Admin SDK script is how they get read and closed.
 *
 *   npm run moderation -- list                 open reports, oldest first, with what each was about
 *   npm run moderation -- list --all           every report
 *   npm run moderation -- show <id>            one report and everything kept of what it was about
 *   npm run moderation -- resolve <id> "note"  mark handled, with a note
 *   npm run moderation -- picture <imageId> [file]  save a picture a reported message carried (its `image.id`)
 *
 * What a report was about is kept as it read when it was filed
 * (reportEvidence/{id}, written by the server beside the report): the card,
 * the profile, or the reported message with the ones before it — and, for a
 * message or a conversation, what its unsent messages said (`unsent`, kept 30
 * days after each was unsent; a picture one carried opens with `picture`).
 * Reports the apps' older builds filed straight from the client have none.
 *
 * Add `--emulator` to run against the local emulators instead of production
 * (credentials come from .env otherwise).
 */
import 'dotenv/config';
import { inertJson, terminalSafe } from './terminal';
import { emulatorEnv, EMULATOR_PROJECT_ID } from '../emulator-env.mjs';
import { purgeAtOf } from '../../src/lib/cards/trash';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const positional = args.filter((a) => !a.startsWith('--'));
const [command = 'list', ...rest] = positional;

async function main() {
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'moderation')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'moderation',
      );
  const db = getFirestore(app);

  if (command === 'list') {
    let q = db.collection('reports').orderBy('createdAt', 'asc');
    if (!args.includes('--all')) q = q.where('status', '==', 'open');
    const snap = await q.get();
    if (snap.empty) {
      console.log('No reports.');
      return;
    }
    const evidence = await db.getAll(...snap.docs.map((d) => db.doc(`reportEvidence/${d.id}`)));
    snap.docs.forEach((d, i) => {
      const r = d.data();
      const when = r.createdAt?.toDate?.().toISOString() ?? '?';
      const t = terminalSafe;
      console.log(
        `${t(d.id)}  ${when}  [${t(r.status)}]  ${t(r.reason)}  ${t(r.targetType)}:${t(r.targetId)}` +
          `  against ${t(r.targetUserId)}  by ${t(r.reporterId)}` +
          (r.contextId ? `  (context ${t(r.contextId)})` : '') +
          (r.detail ? `\n    “${t(r.detail)}”` : ''),
      );
      console.log(`    ${t(summarize(evidence[i].data()))}`);
    });
    return;
  }

  if (command === 'show') {
    const [id] = rest;
    if (!id) throw new Error('Usage: show <reportId>');
    const [report, evidence] = await db.getAll(db.doc(`reports/${id}`), db.doc(`reportEvidence/${id}`));
    if (!report.exists) throw new Error(`No report ${id}`);
    console.log(inertJson(JSON.stringify({ report: plain(report.data()), evidence: plain(evidence.data()) ?? null }, null, 2)));
    // What became of a reported card since: the evidence keeps it as it read when it was filed.
    const r = report.data()!;
    const cardId = r.targetType === 'card' && typeof r.targetId === 'string' && !r.targetId.includes('/') ? r.targetId : null;
    if (cardId) console.log(`card now: ${cardState((await db.doc(`cards/${cardId}`).get()).data())}`);
    return;
  }

  if (command === 'resolve') {
    const [id, note = ''] = rest;
    if (!id) throw new Error('Usage: resolve <reportId> "note"');
    await db.collection('reports').doc(id).update({
      status: 'resolved',
      resolvedAt: FieldValue.serverTimestamp(),
      resolutionNote: note,
    });
    console.log(`Resolved ${id}.`);
    return;
  }

  if (command === 'picture') {
    // A chat picture is in no public place (lib/storage/chatImages): its record names its file.
    const [imageId, out = `picture-${imageId}.webp`] = rest;
    if (!imageId) throw new Error('Usage: picture <imageId> [file]');
    const record = await db.doc(`chatImages/${imageId}`).get();
    const key = record.get('key');
    if (typeof key !== 'string') throw new Error(`No picture ${imageId}`);
    const { getChatImageStore } = await import('../../src/lib/storage/chatImages');
    const store = getChatImageStore();
    if (!store) throw new Error('No chat picture store: set R2_CHAT_BUCKET (or use --emulator)');
    const bytes = await store.get(key);
    if (!bytes) throw new Error(`The file of picture ${imageId} is gone`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(out, bytes);
    console.log(`Saved ${out} (sent by ${record.get('senderId')} in ${record.get('pair')}).`);
    return;
  }

  throw new Error(`Unknown command "${command}" (use list | show | resolve | picture)`);
}

/** One line on a reported card as it is now: live, private, in its author's trash (and until when), or gone. */
function cardState(card: Record<string, unknown> | undefined): string {
  if (!card) return 'gone (deleted for good)';
  const trashedAt = card.trashedAt as { toMillis?: () => number } | undefined;
  if (typeof trashedAt?.toMillis === 'function') {
    const at = trashedAt.toMillis();
    return `in its author's trash since ${new Date(at).toISOString()} (deleted for good ${purgeAtOf(at).toISOString()} unless restored)`;
  }
  if (card.publishedAt == null) return 'a draft';
  return card.visibility === 'public' ? 'live (public)' : `live, ${String(card.visibility ?? 'private')}`;
}

/** One line on what a report kept of its subject (reportEvidence). */
function summarize(e: Record<string, unknown> | undefined): string {
  if (!e) return '(nothing kept: filed by an older app build, straight from the client)';
  const cut = (v: unknown, n = 80) => {
    const t = String(v ?? '').replace(/\s+/g, ' ');
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  const card = e.card as Record<string, unknown> | undefined;
  if (card) return `card “${cut(card.thoughtCore, 40)}” by ${card.authorHandle ?? '?'}${card.anonymous ? ' (anonymous)' : ''}: ${cut(card.story)}`;
  const profile = e.profile as Record<string, unknown> | undefined;
  if (profile) return `profile ${profile.handle ?? '?'}: ${cut(profile.bio)}`;
  const message = e.message as Record<string, unknown> | null | undefined;
  const context = (e.context as unknown[] | undefined) ?? [];
  // What the conversation's unsent messages said, kept 30 days for a report (`show` prints them).
  const unsent = ((e.unsent as unknown[] | undefined) ?? []).length;
  const kept = unsent ? `, ${unsent} unsent kept` : '';
  if (message) {
    const said = message.unsent ? '(unsent — see `unsent`)' : `“${cut(message.text)}”`;
    return `message from ${e.senderHandle ?? message.senderId}: ${said} (+${context.length} before it${kept})`;
  }
  return `conversation with ${e.senderHandle ?? '?'}: its last ${context.length} messages${kept}`;
}

/** Firestore values as plain JSON (timestamps as ISO strings). */
function plain(value: unknown): unknown {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
