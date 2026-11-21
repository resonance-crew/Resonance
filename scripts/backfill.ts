/**
 * One-off data backfills for what the server and rules expect of older data.
 * Each only reports what it would do unless given `--apply`.
 *
 *   npx tsx scripts/backfill.ts anonymous     [--apply] [--emulator]
 *       every card gets a boolean `anonymous` (the public lists filter on it)
 *   npx tsx scripts/backfill.ts handles       [--apply] [--emulator]
 *       reserve every pen name (handles/{name}); duplicates are reported, not reserved
 *   npx tsx scripts/backfill.ts edits         [--apply] [--emulator]
 *       delete pending edits whose card is gone; name the author on the rest
 *   npx tsx scripts/backfill.ts storage-host  [--apply] [--emulator]
 *       config/storage ← R2_PUBLIC_BASE's host (the rules then hold covers and avatars to it);
 *       the host it replaces, and those of R2_FORMER_PUBLIC_BASES, stay taken as formerHosts
 *   npx tsx scripts/backfill.ts rekey-images  [--apply] [--delete-old] [--emulator]
 *       anonymous cards' pictures under keys that name no one (needs R2 credentials to apply)
 *   npx tsx scripts/backfill.ts rehost-images [--apply] [--emulator]
 *       stored pictures' URLs on a former base (R2_FORMER_PUBLIC_BASES) → the same key on R2_PUBLIC_BASE
 *   npx tsx scripts/backfill.ts square-avatars [--apply]
 *       profile photos stored before photos were cut square → cut square as a new one is (the middle,
 *       256 px, WebP) under a new key on record as their owner's, the profile pointing at it; the old
 *       picture stays (reads the photos by their public URLs; --apply needs R2 credentials)
 *   npx tsx scripts/backfill.ts reencode-legacy [--apply] [--emulator]
 *       stored pictures still in a format uploads no longer keep (an `image/…` key that isn't WebP or
 *       AVIF: covers, story pictures, pending edits, profile photos) → re-encoded as an upload is now
 *       (WebP, ≤ 2048 px, a profile photo cut square), under a new key on record as their owner's, the
 *       documents pointing at the copy (no updatedAt or summary change; reportEvidence left as it was);
 *       the old files stay. A dry run lists each picture, its size, what would replace it and every
 *       document naming it (reads the pictures by their public URLs; --apply needs R2 credentials;
 *       on the emulator the pictures are the emulators' own folder, never R2)
 *   npx tsx scripts/backfill.ts cover-thumbs  [--apply] [--emulator]
 *       covers stored before every upload kept a ≤ 960 px copy (B2, lib/images/coverThumb) get one: read by
 *       their public URLs, encoded as an upload's copy is, stored under the key made from the cover's, on record
 *       as the cover's owner's, and named on the card as `media.thumbUrl` (no updatedAt or summary change). A copy
 *       already there is kept. Lists derive the copy's URL from the cover's, so run it before the web that serves
 *       FeedCard.imageThumbUrl, and once more after (docs/release/owed.md); --apply needs R2 credentials (on the
 *       emulator the pictures are the emulators' own folder, never R2)
 *   npx tsx scripts/backfill.ts avatar-colors [--apply] [--emulator]
 *       profiles still wearing the one avatar colour every profile was given (or none) → their own,
 *       picked by uid from lib/design/avatarColors as a new profile's is; any other colour stays
 *   npx tsx scripts/backfill.ts notes         [--apply] [--emulator]
 *       notes left before notes went into the thread → a `kind: 'note'` message in the two people's
 *       conversation (never on an anonymous card; no unread counted; opens a missing conversation,
 *       which may be one its people had deleted — production runs are the owner's call)
 *   npx tsx scripts/backfill.ts anonymous-bells [--apply] [--emulator]
 *       bells of a note or resonance on an anonymous card say so (`payload.anonymous`), as new ones do:
 *       they open the card, never a thread with whoever wrote the note or resonance
 *   npx tsx scripts/backfill.ts orphan-notes  [--apply] [--emulator]
 *       delete notes whose card is gone (left by older builds' client deletes, or a clean-up that failed
 *       after the card went), and those still on an anonymous card in the trash (they go as it goes in);
 *       notes naming no card are reported, not deleted — production runs are the owner's call
 *   npx tsx scripts/backfill.ts card-tombstones [--apply] [--emulator]
 *       tombstones for cards deleted before deleting one left a tombstone, when something still names
 *       them (a resonance, a bookmark, a thread's card, a bell, a thought-map node, a card link, a pending
 *       edit): the rules then refuse a new card under that id, which would take those over
 *   npx tsx scripts/backfill.ts link-previews [--missing] [--apply] [--emulator]
 *       published cards get the previews of their stories' standalone links (fetches the pages;
 *       --apply against production needs LINK_PREVIEW_SECRET or FIREBASE_PRIVATE_KEY — the deployment's —
 *       to sign their pictures); --missing also asks again for every link that has no preview yet
 *       (after previews learn a site, as YouTube's videos in round 5); a dry run also lists every published
 *       paragraph whose card-ness the words rule changed (round 16: a lone link with words of its own reads as
 *       those words) — card id, where the paragraph starts, its link
 *   npx tsx scripts/backfill.ts summary-translations [--apply] [--emulator]
 *       published public cards a list may show get their title and excerpt translated by AI (round 25:
 *       into English for a Chinese story, 繁體中文 for a Latin-script one, both for Japanese or Korean), as a
 *       publish makes them — one small OpenAI call each, two at a time; needs OPENAI_API_KEY to apply (on the
 *       emulator no model is asked: every card answers `offline`) — production runs are the owner's call
 *   npx tsx scripts/backfill.ts tap-passages [--apply] [--emulator]
 *       published cards long enough get their tap passages (round 27: up to three sentences of the story, word for
 *       word, a reader may pick after 共振), as a publish makes them — one small OpenAI call each, two at a time;
 *       needs OPENAI_API_KEY to apply (on the emulator no model is asked: the offline pick) — production runs are
 *       the owner's call (docs/release/owed.md)
 *   npx tsx scripts/backfill.ts story-translations [--apply] [--emulator]
 *       every story a reader may translate (published, public, not in the trash) gets its kept translation
 *       (cards/{id}/translations/{to}) into each language it may go into, made now as the card page's translate
 *       line makes it for its first reader, so nobody waits for the model — one translateStory call each, two at
 *       a time; a dry run counts and estimates; needs OPENAI_API_KEY to apply (on the emulator no model is
 *       asked) — production runs are the owner's call
 *   npx tsx scripts/backfill.ts recommend-index [--all] [--apply] [--emulator]
 *       published cards get round 26's reading (the whole story into its insights, server-only in
 *       cardSignatures) and their parts' vectors — the ones not read by this recipe yet, or every one with --all —
 *       two at a time, 500 ms between, a formula-phrased reading asked once more; then the older recipe's fields go
 *       from cards and every reader's stored picks lose their items and day (askedOn and shown kept). A dry run counts
 *       and estimates tokens and cost; an applied run prints what it spent. Needs OPENAI_API_KEY to apply (on the
 *       emulator no model is asked) — production runs are the owner's call, after the push
 *
 * Production credentials come from .env; `--emulator` runs against the local
 * emulators (EMULATOR_FIRESTORE_PORT etc., see scripts/emulator-env.mjs) and
 * never touches R2 (rekey-images copies nothing there, it only reports).
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';
import { formerPublicBases } from '../src/lib/storage/publicUrl';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const apply = args.includes('--apply');
const [task] = args.filter((a) => !a.startsWith('--'));

async function main() {
  // Before anything reads the environment: the emulator's must win over .env's.
  // On the emulator, a stand-in storage base when none is set.
  const publicBase = useEmulator ? (process.env.R2_PUBLIC_BASE ?? 'https://img.resonance.test') : process.env.R2_PUBLIC_BASE;
  const formerBases = formerPublicBases({ R2_PUBLIC_BASE: publicBase, R2_FORMER_PUBLIC_BASES: process.env.R2_FORMER_PUBLIC_BASES });
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'backfill')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'backfill',
      );
  const db = getFirestore(app);
  console.log(`${projectId}: ${task} (${apply ? 'applying' : 'dry run — add --apply to write'})`);

  switch (task) {
    case 'anonymous': {
      const { backfillAnonymous } = await import('./backfills/anonymous');
      await backfillAnonymous(db, { apply });
      return;
    }
    case 'handles': {
      const { backfillHandles } = await import('./backfills/handles');
      await backfillHandles(db, { apply });
      return;
    }
    case 'edits': {
      const { cleanUpEdits } = await import('./backfills/orphanEdits');
      await cleanUpEdits(db, { apply });
      return;
    }
    case 'storage-host': {
      const { setStorageHost } = await import('./backfills/storageHost');
      await setStorageHost(db, publicBase, { apply, formerBases });
      return;
    }
    case 'rekey-images': {
      const { rekeyAnonymousImages } = await import('./backfills/rekeyImages');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      // On the emulator nothing reaches R2: report only.
      const storage = !useEmulator && apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      await rekeyAnonymousImages(db, storage, { apply: apply && !useEmulator, deleteOld: args.includes('--delete-old'), publicBase });
      return;
    }
    case 'rehost-images': {
      const { rehostImages } = await import('./backfills/rehostImages');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      // Nothing in R2 moves (every key is served by both hosts): only the URLs in Firestore.
      await rehostImages(db, { apply, publicBase, formerBases });
      return;
    }
    case 'square-avatars': {
      const { squareAvatars } = await import('./backfills/squareAvatars');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      if (useEmulator && apply) throw new Error('square-avatars stores pictures in R2: never --apply on the emulator');
      const storage = apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      const read = async (url: string) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength > 20 * 1024 * 1024 ? null : bytes;
      };
      await squareAvatars(db, storage, { apply, publicBases: [publicBase, ...formerBases], read });
      return;
    }
    case 'reencode-legacy': {
      const { reencodeLegacy } = await import('./backfills/reencodeLegacy');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      const bases = [publicBase, ...formerBases];
      const MAX_BYTES = 20 * 1024 * 1024;
      if (useEmulator) {
        // The emulators' pictures are a folder on this machine (lib/storage/local), read and written by key.
        const { LocalStorageProvider } = await import('../src/lib/storage/local');
        const { storageKeyOf } = await import('../src/lib/storage/publicUrl');
        const local = new LocalStorageProvider(undefined, publicBase);
        const read = async (url: string) => {
          const key = storageKeyOf(url, bases);
          return key ? local.getObject(key, MAX_BYTES) : null;
        };
        await reencodeLegacy(db, apply ? local : null, { apply, publicBases: bases, read });
        return;
      }
      const storage = apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      const read = async (url: string) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength > MAX_BYTES ? null : bytes;
      };
      await reencodeLegacy(db, storage, { apply, publicBases: bases, read });
      return;
    }
    case 'cover-thumbs': {
      const { backfillCoverThumbs } = await import('./backfills/coverThumbs');
      if (!publicBase) throw new Error('R2_PUBLIC_BASE is not set');
      const bases = [publicBase, ...formerBases];
      const MAX_BYTES = 20 * 1024 * 1024;
      if (useEmulator) {
        // The emulators' pictures are a folder on this machine (lib/storage/local), read and written by key.
        const { LocalStorageProvider } = await import('../src/lib/storage/local');
        const { storageKeyOf } = await import('../src/lib/storage/publicUrl');
        const local = new LocalStorageProvider(undefined, publicBase);
        const read = async (url: string) => {
          const key = storageKeyOf(url, bases);
          return key ? local.getObject(key, MAX_BYTES) : null;
        };
        const exists = async (url: string) => (await read(url)) !== null;
        await backfillCoverThumbs(db, apply ? local : null, { apply, publicBases: bases, read, exists });
        return;
      }
      const storage = apply ? new (await import('../src/lib/storage/r2')).R2StorageProvider() : null;
      const read = async (url: string) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.byteLength > MAX_BYTES ? null : bytes;
      };
      const exists = async (url: string) => (await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })).ok;
      await backfillCoverThumbs(db, storage, { apply, publicBases: bases, read, exists });
      return;
    }
    case 'avatar-colors': {
      const { backfillAvatarColors } = await import('./backfills/avatarColors');
      await backfillAvatarColors(db, { apply });
      return;
    }
    case 'notes': {
      const { backfillNotes } = await import('./backfills/notes');
      await backfillNotes(db, { apply });
      return;
    }
    case 'anonymous-bells': {
      const { backfillAnonymousBells } = await import('./backfills/anonymousBells');
      await backfillAnonymousBells(db, { apply });
      return;
    }
    case 'orphan-notes': {
      const { deleteOrphanNotes } = await import('./backfills/orphanNotes');
      await deleteOrphanNotes(db, { apply });
      return;
    }
    case 'card-tombstones': {
      const { backfillCardTombstones } = await import('./backfills/cardTombstones');
      await backfillCardTombstones(db, { apply });
      return;
    }
    case 'recommend-index': {
      // indexCard reads and writes through the app's own admin database (getAdminDb, the default app): the same project.
      const { getApps } = await import('firebase-admin/app');
      if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp(app.options);
      const { backfillRecommendIndex } = await import('./backfills/recommendIndex');
      await backfillRecommendIndex(db, { apply, all: args.includes('--all') });
      return;
    }
    case 'story-translations': {
      const { backfillStoryTranslations } = await import('./backfills/storyTranslations');
      await backfillStoryTranslations(db, { apply });
      return;
    }
    case 'tap-passages': {
      const { backfillTapPassages } = await import('./backfills/tapPassages');
      await backfillTapPassages(db, { apply });
      return;
    }
    case 'summary-translations': {
      const { backfillSummaryTranslations } = await import('./backfills/summaryTranslations');
      await backfillSummaryTranslations(db, { apply });
      return;
    }
    case 'link-previews': {
      // The pictures' paths are signed by this process: with a key the deployment doesn't have, they 404.
      const source = process.env.LINK_PREVIEW_SECRET?.trim()
        ? 'LINK_PREVIEW_SECRET'
        : process.env.FIREBASE_PRIVATE_KEY?.trim()
          ? 'a key derived from FIREBASE_PRIVATE_KEY'
          : null;
      if (apply && !useEmulator && !source) {
        throw new Error('Set LINK_PREVIEW_SECRET (or FIREBASE_PRIVATE_KEY) as the deployment has it: the pictures would be signed with a key it does not know.');
      }
      console.log(`pictures signed with ${source ?? 'the development key (emulators only)'}`);
      const { backfillLinkPreviews } = await import('./backfills/linkPreviews');
      await backfillLinkPreviews(db, { apply, missing: args.includes('--missing') });
      return;
    }
    default:
      throw new Error(`Unknown task "${task ?? ''}" (anonymous | handles | edits | storage-host | rekey-images | rehost-images | square-avatars | reencode-legacy | cover-thumbs | avatar-colors | notes | anonymous-bells | orphan-notes | card-tombstones | link-previews | summary-translations | story-translations | tap-passages | recommend-index)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
