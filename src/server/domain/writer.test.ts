import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CreateDraftRequest,
  DRAFT_ID_PATTERN,
  DRAFT_STORY_MAX,
  DRAFT_TAGS_JOINED_MAX,
  DRAFT_TAGS_MAX,
  DRAFT_TITLE_MAX,
  DraftMedia,
  MAP_ID_MAX,
  MAP_LABEL_MAX,
  MAP_TITLE_MAX,
  MapOp,
  MEDIA_LABEL_MAX,
  MEDIA_URL_MAX,
  ORIGINAL_LOCALE_MAX,
  PendingEditRequest,
  REFERENCE_CARD_ID_MAX,
  UpdateDraftRequest,
  mapOpOf,
} from '@/lib/api/v1/schemas';
import { CARD_LIMITS } from '@/lib/db/firestore/cardContent';
import { planMapOps, revApplies, storedRev } from './writer';

// The writer's API holds a client to exactly what firebase/firestore.rules
// held it to when it wrote Firestore itself: every number below is read out
// of the rules' text, so a change on either side without the other fails here.

const RULES = readFileSync(join(__dirname, '..', '..', '..', 'firebase', 'firestore.rules'), 'utf8');

/** The one number the rules' text has where `pattern` puts its group. */
function rule(pattern: RegExp): number {
  const all = [...RULES.matchAll(new RegExp(pattern.source, 'g'))].map((m) => Number(m[1]));
  expect(all.length, String(pattern)).toBeGreaterThan(0);
  expect(new Set(all).size, `${pattern} names one number`).toBe(1);
  return all[0];
}

/** The quoted names of a `hasOnly([...])` list that follows `after` in the rules. */
function hasOnly(after: string): string[] {
  const at = RULES.indexOf(after);
  expect(at, after).toBeGreaterThan(-1);
  const list = /hasOnly\(\[([^\]]*)\]\)/.exec(RULES.slice(at))!;
  return [...list[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort();
}

const keysOf = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape).sort();

describe('the writer API holds the rules’ limits', () => {
  it('the thought map: ids, arrow labels, group titles', () => {
    expect(MAP_ID_MAX).toBe(rule(/v\.size\(\) <= (\d+);/));
    expect(MAP_LABEL_MAX).toBe(rule(/optionalString\(request\.resource\.data, "label", (\d+)\)/));
    expect(MAP_TITLE_MAX).toBe(rule(/d\.title\.size\(\) <= (\d+)/));
    const ok = (o: Record<string, unknown>) => MapOp.safeParse(o).success;
    expect(ok({ op: 'addNode', cardId: 'x'.repeat(MAP_ID_MAX), x: 0, y: 0 })).toBe(true);
    expect(ok({ op: 'addNode', cardId: 'x'.repeat(MAP_ID_MAX + 1), x: 0, y: 0 })).toBe(false);
    expect(ok({ op: 'addNode', cardId: '', x: 0, y: 0 })).toBe(false);
    expect(ok({ op: 'addNode', cardId: 'a/b', x: 0, y: 0 })).toBe(false);
    expect(ok({ op: 'addNode', cardId: '__x__', x: 0, y: 0 })).toBe(false);
    expect(ok({ op: 'addNode', cardId: 'c', x: '1', y: 0 })).toBe(false);
    expect(ok({ op: 'addEdge', sourceCardId: 'a', targetCardId: 'b', label: 'w'.repeat(MAP_LABEL_MAX) })).toBe(true);
    expect(ok({ op: 'addEdge', sourceCardId: 'a', targetCardId: 'b', label: 'w'.repeat(MAP_LABEL_MAX + 1) })).toBe(false);
    expect(ok({ op: 'updateGroup', groupId: 'g', title: 't'.repeat(MAP_TITLE_MAX + 1) })).toBe(false);
    // An op takes its own fields only (a null one is absent: Kotlin sends every field).
    expect(ok({ op: 'removeNode', cardId: 'c', x: null, label: null })).toBe(true);
    expect(ok({ op: 'removeNode', cardId: 'c', x: 1 })).toBe(false);
    expect(ok({ op: 'removeNode', cardId: 'c', extra: 1 })).toBe(false);
    expect(ok({ op: 'addGroup', groupId: 'g', title: '', hue: 1, x: 0, y: 0, w: 1 })).toBe(false);
    expect(mapOpOf({ op: 'setNodeGroup', cardId: 'c', groupId: null })).toEqual({ op: 'setNodeGroup', cardId: 'c' });
  });

  it('a draft: its id, and the fields and limits of the rules’ create and update', () => {
    expect(DRAFT_ID_PATTERN.source).toBe(/cardId\.matches\("([^"]+)"\)/.exec(RULES)![1]);
    expect(ORIGINAL_LOCALE_MAX).toBe(rule(/optionalString\(request\.resource\.data, "originalLocale", (\d+)\)/));
    expect(REFERENCE_CARD_ID_MAX).toBe(rule(/d\.referenceCardId\.size\(\) <= (\d+)/));
    expect(MEDIA_URL_MAX).toBe(rule(/url\.size\(\) <= (\d+)/));
    expect(DRAFT_TITLE_MAX).toBe(rule(/d\.thoughtCore\.size\(\) <= (\d+)/));
    expect(DRAFT_STORY_MAX).toBe(rule(/d\.story\.size\(\) <= (\d+)/));
    expect(DRAFT_TAGS_MAX).toBe(rule(/d\.tags\.size\(\) <= (\d+)/));
    expect(DRAFT_TAGS_JOINED_MAX).toBe(rule(/d\.tags\.join\(" "\)\.size\(\) <= (\d+)/));
    expect(MEDIA_LABEL_MAX).toBe(rule(/m\.label\.size\(\) <= (\d+)/));
    // The server's own copy of the same limits (applying an edit) agrees.
    expect([CARD_LIMITS.title, CARD_LIMITS.story, CARD_LIMITS.tags, CARD_LIMITS.tagsJoined, CARD_LIMITS.mediaLabel, CARD_LIMITS.url]).toEqual([
      DRAFT_TITLE_MAX,
      DRAFT_STORY_MAX,
      DRAFT_TAGS_MAX,
      DRAFT_TAGS_JOINED_MAX,
      MEDIA_LABEL_MAX,
      MEDIA_URL_MAX,
    ]);
    // The fields: a client's create, less what the server stamps itself.
    const stamped = ['authorId', 'publishedAt', 'readCount', 'resonanceCount', 'inviteCount', 'createdAt', 'updatedAt', 'translations'];
    expect(hasOnly('allow create: if signedIn()\n        && cardId.matches').filter((k) => !stamped.includes(k))).toEqual(
      keysOf(CreateDraftRequest).filter((k) => k !== 'id'),
    );
    // An update's: what the author may change, `updatedAt` stamped; `rev` and `clear` are the API's own.
    expect(hasOnly('allow update: if signedIn()\n        && resource.data.authorId == request.auth.uid').filter((k) => k !== 'updatedAt')).toEqual(
      keysOf(UpdateDraftRequest).filter((k) => k !== 'rev' && k !== 'clear'),
    );
    expect(hasOnly('editId == "current"').filter((k) => k !== 'updatedAt' && k !== 'authorId')).toEqual(keysOf(PendingEditRequest).filter((k) => k !== 'rev'));
    // `key` (ADR 0005) is the server's: it makes it from the URL (domain/media.ts mediaKeyFor) and the API takes
    // none; the rules take it only so a client saving back a cover it read is not refused, and only as the URL's key.
    expect(hasOnly('function validMedia').filter((k) => k !== 'key').sort()).toEqual(keysOf(DraftMedia));
    expect(hasOnly('function validMedia')).toContain('key');
  });

  it('the draft fields refuse what the rules refuse', () => {
    const base = { rev: 1 };
    const ok = (o: Record<string, unknown>) => UpdateDraftRequest.safeParse({ ...base, ...o }).success;
    expect(ok({ thoughtCore: 'x'.repeat(DRAFT_TITLE_MAX) })).toBe(true);
    expect(ok({ thoughtCore: 'x'.repeat(DRAFT_TITLE_MAX + 1) })).toBe(false);
    // Counted in UTF-16 units, as the rules count (an emoji is two).
    expect(ok({ thoughtCore: '😀'.repeat(DRAFT_TITLE_MAX / 2 + 1) })).toBe(false);
    expect(ok({ tags: Array(DRAFT_TAGS_MAX + 1).fill('t') })).toBe(false);
    expect(ok({ tags: ['x'.repeat(DRAFT_TAGS_JOINED_MAX + 1)] })).toBe(false);
    expect(ok({ tags: [1] })).toBe(false);
    expect(ok({ visibility: 'friends' })).toBe(false);
    expect(ok({ accentHue: 361 })).toBe(false);
    expect(ok({ accentHue: -1 })).toBe(false);
    // What only the server writes: refused by name.
    for (const field of ['publishedAt', 'slug', 'authorId', 'referenceCardId', 'readCount', 'trashedAt', 'draftRev', 'originalLocale']) {
      expect(ok({ [field]: null }), field).toBe(false);
    }
    const media = (m: Record<string, unknown>) => ok({ media: { type: 'image', url: 'https://media.test/a.webp', ...m } });
    expect(media({})).toBe(true);
    expect(media({ type: 'gif' })).toBe(false);
    expect(media({ url: 'http://elsewhere.test/a.webp' })).toBe(false);
    expect(media({ url: 'http://localhost:3000/a.webp' })).toBe(true);
    expect(media({ url: `https://media.test/${'a'.repeat(MEDIA_URL_MAX)}` })).toBe(false);
    expect(media({ thumbUrl: 'https://media.test/a-w960.webp' })).toBe(true);
    expect(media({ thumbUrl: 'https://media.test/a.webp' })).toBe(false);
    expect(media({ label: 'l'.repeat(MEDIA_LABEL_MAX + 1) })).toBe(false);
    expect(media({ frame: { cx: 0.5, cy: 0.5, zoom: 2, ar: 5 } })).toBe(true);
    expect(media({ frame: { cx: 0.5, cy: 0.5, zoom: 2.1, ar: 1 } })).toBe(false);
    expect(media({ frame: { cx: 0.5, cy: 0.5, zoom: 1, ar: 0.1 } })).toBe(false);
    expect(media({ other: 1 })).toBe(false);
    expect(UpdateDraftRequest.safeParse({ story: 'x' }).success).toBe(false);
    expect(UpdateDraftRequest.safeParse({ rev: 0 }).success).toBe(false);
    expect(UpdateDraftRequest.safeParse({ rev: 1.5 }).success).toBe(false);
    expect(CreateDraftRequest.safeParse({ id: 'short', thoughtCore: '', story: '', tags: [], visibility: 'public' }).success).toBe(false);
    expect(CreateDraftRequest.safeParse({ id: 'AbCdEfGhIjKlMnOpQrSt', thoughtCore: '', story: '', tags: [], visibility: 'public' }).success).toBe(true);
    expect(CreateDraftRequest.safeParse({ id: 'AbCdEfGhIjKlMnOpQrSt', thoughtCore: '', story: '', tags: [], visibility: 'public', publishedAt: null }).success).toBe(false);
  });
});

describe('the rev rule', () => {
  it('applies only a higher count; a stored count that is no whole number is none', () => {
    expect(revApplies(undefined, 1)).toBe(true);
    expect(revApplies(3, 3)).toBe(false);
    expect(revApplies(3, 2)).toBe(false);
    expect(revApplies(3, 4)).toBe(true);
    expect(storedRev('7')).toBe(0);
    expect(storedRev(-2)).toBe(0);
    expect(storedRev(2.5)).toBe(0);
  });
});

describe('a map batch’s plan', () => {
  it('writes each touched document once, as the batch leaves it', () => {
    const plan = planMapOps({ nodes: [], edges: [], groups: [] }, [
      { op: 'addNode', cardId: 'c', x: 0, y: 0 },
      { op: 'moveNode', cardId: 'c', x: 5, y: 5 },
      { op: 'addNode', cardId: 'd', x: 0, y: 0 },
      { op: 'removeNode', cardId: 'd' },
    ]);
    expect(plan.writes).toEqual([
      { kind: 'node', id: 'c', write: 'create', fields: { cardId: 'c', x: 5, y: 5, groupId: null } },
      { kind: 'node', id: 'd', write: 'delete' },
    ]);
    expect(plan.applied).toBe(4);
  });
});
