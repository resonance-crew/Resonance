import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { storageKeyOf } from '../../src/lib/storage/publicUrl';
import { normalizeUpload, type NormalizedImage, type UploadPurpose } from '../../src/lib/storage/image';
import { storeOwned } from '../../src/lib/storage/uploads';
import type { IStorageProvider } from '../../src/lib/storage/interfaces';

/** Where a re-encoded picture is stored (and removed again should its record fail). */
export type PictureStorage = Pick<IStorageProvider, 'uploadObject' | 'deleteObject'>;

/** A stored picture's bytes by its public URL; null when there is none. */
export type ReadPicture = (url: string) => Promise<Uint8Array | null>;

/** A key of ours that holds a picture in a format we no longer store: an image (`image/…`) that isn't WebP or AVIF. */
export function isLegacyPictureKey(key: string): boolean {
  if (!key.startsWith('image/')) return false;
  const name = key.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return ext !== 'webp' && ext !== 'avif';
}

type Kind = 'users' | 'cards' | 'edits';

/** One document naming legacy pictures: where, by which fields, and whose it is. */
interface Naming {
  kind: Kind;
  doc: QueryDocumentSnapshot;
  owner: string | null;
  /** Field path → the legacy URL it holds (avatarUrl, media.url). */
  fields: Record<string, string>;
  /** The legacy URLs its story holds. */
  story: string[];
  purpose: UploadPurpose;
}

/** One legacy picture to re-encode, for one purpose (a profile photo is cut square, as a new one is). */
interface Picture {
  url: string;
  key: string;
  purpose: UploadPurpose;
  /** Whose the new copy is recorded as: the first document naming it that has an owner. */
  owner: string | null;
  names: string[];
}

const pictureId = (purpose: UploadPurpose, url: string) => `${purpose} ${url}`;

/**
 * A few dozen pictures stored before uploads were re-encoded on the way in
 * (round 22: 25 PNG and 3 JPEG under the old `image/{uid}/…` keys) are still
 * named by covers, story pictures, pending edits and profile photos — full
 * size, with whatever metadata they came with. Each is re-encoded here
 * exactly as an upload is now (normalizeUpload: upright, ≤ 2048 px — a
 * profile photo cut square at 256 —, WebP, no metadata), stored under a fresh
 * key on record as its owner's (storeOwned: the account purge finds it), and
 * every document naming it points at the copy, wherever one is kept —
 *
 *  - users/{uid}: the profile photo (avatarUrl)
 *  - cards/{id}: the cover (media.url) and the pictures in the story
 *  - cards/{id}/edits/current: the pending edit's cover and story
 *
 * — as rehost-images rewrites them: only the URLs change, never updatedAt,
 * excerptAt or anything else a list or a cache goes by, and reportEvidence/*
 * (what was reported, as it was) is left alone. The old files stay where they
 * are: nothing names them any more, pages cached before still show them, and
 * their key or record still finds them for the account purge. A picture named
 * by several documents is re-encoded once. One that can't be read or decoded
 * is reported and left. A document written to after it was read here is not
 * overwritten — it is reported, and the next run takes it. Idempotent: what
 * is left names no legacy key; with `apply: false` it only reports — each
 * picture, its size, what would replace it, and every document naming it.
 */
export async function reencodeLegacy(
  db: Firestore,
  storage: PictureStorage | null,
  opts: { apply: boolean; publicBases: readonly string[]; read: ReadPicture; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  if (opts.apply && !storage) throw new Error('reencode-legacy --apply needs the storage (R2 credentials)');
  const bases = [...new Set(opts.publicBases.map((b) => b.replace(/\/+$/, '')).filter(Boolean))];
  if (!bases.length) throw new Error('R2_PUBLIC_BASE is not set: there is no storage to find pictures on');

  /** The URL's key when it is a legacy picture of ours, else null. */
  const legacy = (url: unknown): string | null => {
    if (typeof url !== 'string') return null;
    const key = storageKeyOf(url, bases);
    return key && isLegacyPictureKey(key) ? key : null;
  };
  // A URL of ours inside Markdown runs to whitespace, a bracket or a quote (as rehost-images reads them).
  const escaped = bases.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const inStory = new RegExp(`(?:${escaped.join('|')})/[^\\s)"'<>]+`, 'g');
  const storyUrls = (story: unknown): string[] =>
    typeof story === 'string' ? [...new Set([...story.matchAll(inStory)].map((m) => m[0]))].filter((u) => legacy(u)) : [];

  const [users, cards, edits] = await Promise.all([
    db.collection('users').select('avatarUrl').get(),
    db.collection('cards').select('authorId', 'media', 'story').get(),
    db.collectionGroup('edits').select('authorId', 'media', 'story').get(),
  ]);
  const authorOf = new Map(cards.docs.map((d) => [d.id, d.get('authorId')]));
  const ownerOf = (value: unknown) => (typeof value === 'string' && value && !value.includes('/') ? value : null);

  const namings: Naming[] = [];
  for (const doc of users.docs) {
    const url = doc.get('avatarUrl');
    if (legacy(url)) namings.push({ kind: 'users', doc, owner: doc.id, fields: { avatarUrl: url }, story: [], purpose: 'avatar' });
  }
  for (const [kind, snap] of [['cards', cards], ['edits', edits]] as const) {
    for (const doc of snap.docs) {
      const cover = doc.get('media.url');
      const fields: Record<string, string> = legacy(cover) ? { 'media.url': cover } : {};
      const story = storyUrls(doc.get('story'));
      if (!Object.keys(fields).length && !story.length) continue;
      const owner = ownerOf(doc.get('authorId')) ?? (kind === 'edits' ? ownerOf(authorOf.get(doc.ref.parent.parent?.id ?? '')) : null);
      namings.push({ kind, doc, owner, fields, story, purpose: 'image' });
    }
  }

  const pictures = new Map<string, Picture>();
  for (const n of namings) {
    for (const [field, url] of [...Object.entries(n.fields), ...n.story.map((url) => ['story', url] as const)]) {
      const id = pictureId(n.purpose, url);
      const p = pictures.get(id) ?? { url, key: legacy(url)!, purpose: n.purpose, owner: null, names: [] };
      p.owner ??= n.owner;
      p.names.push(`${n.doc.ref.path} (${field})`);
      pictures.set(id, p);
    }
  }

  const report = {
    users: users.size,
    cards: cards.size,
    edits: edits.size,
    documents: namings.length,
    pictures: pictures.size,
    unreadable: 0,
    noOwner: 0,
    reencoded: 0,
    rewritten: 0,
    notWritten: 0,
  };
  log(`users: ${users.size}, cards: ${cards.size}, pending edits: ${edits.size}; documents naming a legacy picture: ${namings.length}`);
  log(`legacy pictures: ${pictures.size}`);

  // Each picture read and re-encoded (in a dry run too: what would replace it is the report's point).
  const ready = new Map<string, NormalizedImage>();
  for (const [id, p] of pictures) {
    const bytes = await opts.read(p.url).catch(() => null);
    const meta = bytes ? await sharp(bytes).metadata().catch(() => null) : null;
    const image = bytes && meta ? await normalizeUpload(bytes, p.purpose).catch(() => null) : null;
    if (!bytes || !meta || !image) {
      report.unreadable++;
      log(`  ${p.key}: unreadable${bytes ? ` (${bytes.byteLength} bytes)` : ''} — left as it is`);
    } else {
      const as = p.purpose === 'avatar' ? 'profile photo' : 'picture';
      log(`  ${p.key}: ${meta.format} ${meta.width}×${meta.height}, ${bytes.byteLength} bytes → WebP ${image.width}×${image.height}, ${image.data.byteLength} bytes (${as}, a new key on record as ${p.owner ?? 'no one'})`);
      if (!p.owner) {
        report.noOwner++;
        log('    no document naming it says whose it is — left as it is');
      } else {
        ready.set(id, image);
      }
    }
    for (const name of p.names) log(`    named by ${name}`);
  }
  if (!opts.apply || !ready.size) return report;

  // Stored first, each once; the documents then point at the copies.
  const moved = new Map<string, string>();
  for (const [id, image] of ready) {
    const p = pictures.get(id)!;
    try {
      const stored = await storeOwned(
        db,
        storage!,
        { filename: `upload.${image.extension}`, contentType: image.contentType, size: image.data.byteLength, ownerId: p.owner!, kind: 'image' },
        image.data,
      );
      moved.set(id, stored.publicUrl);
      report.reencoded++;
      log(`  ${p.url} → ${stored.publicUrl}`);
    } catch (e) {
      log(`  ${p.url}: not stored (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  const writer = db.bulkWriter();
  const notWritten: string[] = [];
  for (const n of namings) {
    const patch: Record<string, string> = {};
    for (const [path, url] of Object.entries(n.fields)) {
      const to = moved.get(pictureId(n.purpose, url));
      if (to) patch[path] = to;
    }
    if (n.story.length) {
      const story = n.doc.get('story') as string;
      const next = story.replace(inStory, (url) => moved.get(pictureId(n.purpose, url)) ?? url);
      if (next !== story) patch.story = next;
    }
    if (!Object.keys(patch).length) continue;
    // Only if nobody wrote to it since it was read: a newer draft must not get its older story back.
    writer
      .update(n.doc.ref, patch, { lastUpdateTime: n.doc.updateTime })
      .then(() => void report.rewritten++)
      .catch((e: { code?: number; message?: string }) =>
        void notWritten.push(`${n.doc.ref.path} (${e.code === 9 ? 'changed while this ran' : e.message ?? 'failed'})`),
      );
  }
  await writer.close();
  report.notWritten = notWritten.length;
  log(`re-encoded ${report.reencoded} picture(s), rewrote ${report.rewritten} document(s); the old files are kept`);
  if (notWritten.length) log(`not written — run again:\n  ${notWritten.join('\n  ')}`);
  return report;
}
