import { z } from 'zod';
import {
  apiRegistry,
  BELL_PAGE,
  BELL_PAGE_MAX,
  CARD_INCLUDES,
  CARD_KEYS_MAX,
  CardBoxTab,
  PROFILE_INCLUDES,
  THREAD_PAGE,
  THREAD_PAGE_MAX,
} from './schemas';

type Json = Record<string, unknown>;

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (schema: Json) => ({ content: { 'application/json': { schema } } });
const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { description: 'Error', ...json(ref('ApiError')) }]));
const pathParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });
const pageParams = [
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
  {
    name: 'cursor',
    in: 'query',
    required: false,
    description: "A page's `nextCursor` (to the millisecond: cards sharing it can be skipped). Prefer `pageToken`.",
    schema: { type: 'string', format: 'date-time' },
  },
  {
    name: 'pageToken',
    in: 'query',
    required: false,
    description: "A page's `nextPageToken`: resumes exactly after its last card. Wins over `cursor`.",
    schema: { type: 'string', maxLength: 512 },
  },
];
const get = (operationId: string, summary: string, schema: string, extra: Json = {}, errorCodes = [400, 401, 404]) => ({
  get: { operationId, summary, ...extra, responses: { '200': { description: 'OK', ...json(ref(schema)) }, ...errors(...errorCodes) } },
});
const cardId = pathParam('key', 'The card id');
const conversationParam = pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`");
const pageTokenParam = (description: string) => ({ name: 'pageToken', in: 'query', required: false, description, schema: { type: 'string', maxLength: 512 } });
const handle = pathParam('handle', 'Pen name (any script)');
const include = (names: readonly string[], what: string) => ({
  name: 'include',
  in: 'query',
  required: false,
  description: `${what}, comma-separated (e.g. \`${names.join(',')}\`): ${names.join(', ')}. Unknown names are ignored.`,
  schema: { type: 'string' },
});

/**
 * OpenAPI 3.0 for /api/v1, built from the Zod schemas in ./schemas.
 * (3.0 rather than 3.1: both the Swift and the Kotlin generators handle it fully.)
 */
export function buildOpenApi(): Json {
  const { schemas } = z.toJSONSchema(apiRegistry, {
    target: 'openapi-3.0',
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, Json> };

  // Components are referenced, not identified: drop JSON Schema `$id`s. And
  // drop `additionalProperties: false` — v1 grows by adding fields, so
  // clients must not reject ones they don't know yet.
  // And an optional reference with nothing beside it is the reference itself
  // (Zod wraps it in a one-item allOf, which the generators turn into a
  // wrapper type for no reason).
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === 'object') {
      const { allOf } = node as { allOf?: unknown[] };
      if (Object.keys(node).length === 1 && Array.isArray(allOf) && allOf.length === 1) return clean(allOf[0]);
      const out: Json = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === '$id' || (k === 'additionalProperties' && v === false)) continue;
        out[k] = clean(v);
      }
      return out;
    }
    return node;
  };
  const components = Object.fromEntries(Object.entries(schemas).map(([k, v]) => [k, clean(v)]));

  return {
    openapi: '3.0.3',
    info: {
      title: 'Resonance API',
      version: '1.0.0',
      description:
        'The versioned API for the native apps. Authenticate with `Authorization: Bearer <Firebase ID token>` ' +
        '(the web uses its session cookie), or with an access token from POST /auth/exchange the same way. ' +
        'Additive changes only within v1.',
    },
    servers: [{ url: '/api/v1' }],
    security: [{ firebaseIdToken: [] }],
    paths: {
      '/me': {
        get: {
          operationId: 'getMe',
          summary: 'The signed-in account',
          responses: { '200': { description: 'OK', ...json(ref('Me')) }, ...errors(401, 404) },
        },
        post: {
          operationId: 'createProfile',
          summary: 'Onboarding: create your profile (an existing one comes back unchanged, unless it has no pen name yet)',
          description:
            'A profile without a pen name — made before onboarding asked for one — takes the one sent (reserved, `409` when taken) ' +
            'with the region and writing language sent, keeping the rest; it then comes back `200`. Reaching anyone ' +
            '(a note, a message, a resonance that rings) takes a pen name.',
          requestBody: { required: true, ...json(ref('CreateProfileRequest')) },
          responses: {
            '200': { description: 'Already had a profile (named now, if it had no pen name)', ...json(ref('Me')) },
            '201': { description: 'Created', ...json(ref('Me')) },
            ...errors(400, 401, 409),
          },
        },
        patch: {
          operationId: 'updateProfile',
          summary: 'Change your pen name, bio, region, writing language, photo, translation languages or hint counts',
          requestBody: { required: true, ...json(ref('UpdateProfileRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('Me')) }, ...errors(400, 401, 404, 409) },
        },
      },
      '/handles/{handle}': get('getHandleAvailability', 'Whether a pen name is free', 'HandleAvailability', {
        parameters: [handle],
      }, [400, 401]),
      '/me/trash': {
        delete: {
          operationId: 'emptyTrash',
          summary: 'Empty your trash: every card in it is deleted for good, a page at a time',
          description:
            'The first call sends no `before`; call again with the answer\'s `before` while `remaining` and `deleted` are both ' +
            'above 0. Only cards still in the trash from before `before` are taken: one restored meanwhile, or moved there ' +
            'since, stays. `deleted` counts the cards this call deleted.',
          parameters: [
            {
              name: 'before',
              in: 'query',
              required: false,
              description: "The first call's answer's `before` (ISO 8601); absent: now.",
              schema: { type: 'string', format: 'date-time' },
            },
          ],
          responses: { '200': { description: 'OK', ...json(ref('EmptiedTrash')) }, ...errors(400, 401, 429) },
        },
      },
      '/me/cards': get('getCardBox', 'One shelf of your card box', 'CardList', {
        parameters: [
          { name: 'tab', in: 'query', required: true, schema: { type: 'string', enum: [...CardBoxTab.options] } },
        ],
      }, [400, 401]),
      '/me/cardbox': get('getCardBoxShelves', 'Several shelves of your card box at once', 'CardBox', {
        description: 'Each shelf asked for comes back exactly as `/me/cards?tab=` answers it; shelves not asked for are absent.',
        parameters: [
          {
            name: 'shelves',
            in: 'query',
            required: true,
            description: `Shelves, comma-separated (e.g. \`published,private,draft\`): ${CardBoxTab.options.join(', ')}. Unknown names are ignored.`,
            schema: { type: 'string', maxLength: 200 },
          },
        ],
      }, [400, 401]),
      '/feed': get('getFeed', 'Latest public cards, newest first (named cards of people you blocked are left out)', 'FeedPage', {
        description: 'Anonymous cards come without a byline, and a block never leaves one out: that would name its author.',
        parameters: pageParams,
      }, [400, 401]),
      '/feed/recommended': get('getRecommendedFeed', "Today's picks for you, each with the reason it was picked", 'RecommendedFeed', {
        description:
          'Answers at once from the latest picks. While today\'s are being prepared `status` is `stale` ' +
          '(earlier picks, or a quick first pass without reasons); ask again a little later for `fresh` ones.',
      }, [401]),
      '/cards': {
        ...get('getCards', 'Several cards at once, by slug or id, as list summaries (no story)', 'CardList', {
          description:
            'In the order asked, each card once; cards you may not read, named cards by someone you blocked, and unknown keys are ' +
            'left out. Anonymous cards come without a byline, and a block never leaves one out (nor any list or feed): that would ' +
            'name its author.',
          parameters: [
            {
              name: 'keys',
              in: 'query',
              required: true,
              description: `Card slugs or ids, comma-separated (1–${CARD_KEYS_MAX})`,
              schema: { type: 'string' },
            },
          ],
        }, [400, 401]),
        // --- Phase 2 writer (2a-writer) ---
        post: {
          operationId: 'createDraft',
          summary: 'Start a draft under the id your client made',
          description:
            'The id is 20 letters and digits (as Firestore\'s auto ids), made by the client so an offline save can name the draft ' +
            'before it exists. Unpublished, its counters zeroed. Sent again for your own draft: `200` with `created: false`, ' +
            'nothing written. An id in use by another card, or one deleted for good, is `409 conflict`: make another. Anonymous ' +
            'and for connections only is `400 invalid_request` ("An anonymous card is public or private."). With ' +
            '`referenceCardId`, a card you may read (`404` otherwise), and not across a block unless it is anonymous (`403 blocked`). ' +
            'A cover is one of ours. Autosaves go to `PATCH /cards/{key}/draft`; publishing to `POST /cards/{key}/publish`.',
          requestBody: { required: true, ...json(ref('CreateDraftRequest')) },
          responses: {
            '200': { description: 'Your draft was there already', ...json(ref('CreatedDraft')) },
            '201': { description: 'Created', ...json(ref('CreatedDraft')) },
            ...errors(400, 401, 403, 404, 409, 429),
          },
        },
      },
      '/cards/{key}': {
        ...get('getCard', 'A card you may read, by slug or id, with its story', 'CardDetail', {
          description:
            'With `include`, the lists its page shows come along — each exactly what its own endpoint answers ' +
            '(`resonances`, `related`, `links`) — and `embeds`: the cards its story embeds. Someone else\'s 私人卡 ' +
            '(`visibility: private`, or `publishedAt: null`, with `isOwner: false`) is one its author sent you in a message: ' +
            'yours to read only — a note, a resonance or sending it on is refused as for any card you can\'t read — and only ' +
            'while that message stands (`GET /cards?keys=` answers it the same way).',
          parameters: [pathParam('key', 'The card slug, or (older cards) its id'), include(CARD_INCLUDES, 'Lists to bring along')],
        }),
        patch: {
          operationId: 'updateCard',
          summary: "Change your card's visibility and/or anonymity (only the fields sent)",
          description:
            'A published resonance made public under your name — published private, connections-only or anonymous, it reached ' +
            "no one — reaches the original's author after the response, as publishing it so would have: you two connected " +
            '(not when the original is anonymous), their bell rung — once per reader and card, whatever path rang it first; ' +
            'never across a block, nor without a pen name. The answer never waits on it. One made private, connections-only ' +
            'or anonymous is at once no longer a reason you two are connected, and the connection goes when no reason is left ' +
            '(see `DELETE /cards/{key}/resonances/{cardId}`); the card still answers the original (listed under it while ' +
            'public, without your name when anonymous). An anonymous card is ' +
            'public or private: a change that would leave it anonymous and for connections only is `400 invalid_request` ("An ' +
            'anonymous card is public or private."); a card already that way stays so until either field changes. A card in ' +
            'the trash changes only by a restore: `409 conflict` ("This card is in the trash.").',
          parameters: [pathParam('key', 'The card id')],
          requestBody: { required: true, ...json(ref('UpdateCardRequest')) },
          responses: { '200': { description: 'The card as your card box shows it', ...json(ref('FeedCard')) }, ...errors(400, 401, 404, 409) },
        },
        delete: {
          operationId: 'deleteCard',
          summary: 'Delete your card for good, draft or published (a retry after success is 404)',
          description:
            'Clients with a trash move cards there first (`POST /cards/{key}/trash`) and delete for good only from it, ' +
            'sending `onlyIfTrashed=true`: a card no longer in the trash (restored on another device) is then `409 conflict` ' +
            '("This card is not in the trash.") and stays. ' +
            'A resonance is taken back with it, as `DELETE /cards/{key}/resonances/{cardId}` takes it back. The notes left on ' +
            'the card go with it. The only way a published card is deleted: a client may delete its own draft straight from ' +
            'Firestore, never a published card.',
          parameters: [
            pathParam('key', 'The card id'),
            {
              name: 'onlyIfTrashed',
              in: 'query',
              required: false,
              description: '`true`: refuse (409) a card that is not in the trash.',
              schema: { type: 'string', enum: ['true', 'false'] },
            },
          ],
          responses: { '204': { description: 'Deleted' }, ...errors(400, 401, 404, 409) },
        },
      },
      '/cards/{key}/trash': {
        post: {
          operationId: 'trashCard',
          summary: 'Move your card to the trash: private to everyone until you restore it, deleted for good after 30 days',
          description:
            'Where a card goes when you delete it. While there it is private (nobody else can read, list or answer it: it is ' +
            "absent to them as a missing card is) and answers nothing (`referenceCardId` is parked); it keeps its slug, dates, " +
            'story and place. A resonance is taken back at once, as hiding it is: no longer a reason you are connected, and ' +
            'the connection goes when no reason is left — restoring it never brings that back. The notes left on an anonymous ' +
            'card are deleted (they do not come back); a named card keeps its notes. It is changed by nothing but a restore ' +
            '(PATCH, publish, edits/apply and resonating with it are `409 conflict`, "This card is in the trash."). A card in the ' +
            'trash already is `changed: false`, its 30 days running from when it first went in. Someone else\'s card, or one ' +
            'past its purge date, is `404`.',
          parameters: [cardId],
          responses: { '200': { description: 'OK', ...json(ref('TrashedCard')) }, ...errors(400, 401, 404, 429) },
        },
      },
      '/cards/{key}/restore': {
        post: {
          operationId: 'restoreCard',
          summary: 'Bring your card back from the trash as it was (its visibility, slug and place)',
          description:
            'A resonance answers its original again, as making a hidden one public again does — unless another of your cards ' +
            'answers that original now, or the original answers this card: then it comes back on its own (`droppedResonance`). ' +
            "Its original's author is rung only if this resonance never reached them before (once ever per reader and card). " +
            'A card not in the trash is `changed: false`; one past its purge date (30 days in) is `404`.',
          parameters: [cardId],
          responses: { '200': { description: 'OK', ...json(ref('RestoredCard')) }, ...errors(400, 401, 404, 429) },
        },
      },
      '/cards/{key}/resonances': {
        ...get('getCardResonances', 'Public cards written in response to this one', 'CardList', { parameters: [cardId] }),
        post: {
          operationId: 'resonateWithCard',
          summary: 'Make one of your published public cards a resonance of this one (connects you and rings its author, as publishing one does)',
          description:
            'A card answers one card, and you answer a card with one of yours: `409 conflict` when the card already answers another, ' +
            'or another of your cards already answers this one — and when yours is in the trash ("This card is in the trash."). ' +
            'Asking again with the same card is `changed: false` and rings no one. ' +
            'An anonymous card connects no one and rings no one; an anonymous original rings its author but connects no one ' +
            '(that bell carries `payload.anonymous`: its push opens the card). ' +
            'A block either way is `403 blocked` for a named original; an anonymous one is answered all the same, and the block ' +
            'keeps it from reaching anyone. A card public under your name needs your pen name (`403 forbidden`). While it ' +
            'stands it is a reason you two are connected (one more, when you already are), and the original\'s author ' +
            'writing to you while it stands (a message, or a note in your thread) answers it: a reason for good. A letter ' +
            'waiting between you is left as it is — only its recipient answers it.',
          parameters: [cardId],
          requestBody: { required: true, ...json(ref('ResonateRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('ResonateResponse')) }, ...errors(400, 401, 403, 404, 409, 429) },
        },
      },
      '/cards/{key}/resonances/{cardId}': {
        delete: {
          operationId: 'unresonateCard',
          summary: 'Your card stops answering this one and stays as a card of its own (204 whether or not it still did)',
          description:
            "It no longer keeps you connected with the card's author: the connection goes exactly when no reason is left — " +
            "no other resonance between you either way, no answer to one from its original's author (their message or note " +
            'in your thread while it stood; words from before it never answer it, and its writer\'s own answer nothing), no ' +
            'answered letter, no accepted invite, not made before reasons were kept. A letter waiting between you is left as ' +
            'it was. Their bell stays too: answering that card again rings and connects no one.',
          parameters: [pathParam('key', 'The card id it answers'), pathParam('cardId', 'Your card id')],
          responses: { '204': { description: 'It no longer answers this card' }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/private-shares': get(
        'getPrivateShares',
        'Whether your card was ever sent privately in a message — to warn before making it anonymous',
        'PrivateShares',
        {
          description:
            'True once one of your messages shared this card as a 私人卡, whatever became of the message since (unsent, ' +
            'stopped, the conversation deleted): its recipient may have read it, and knows it is yours. Making it anonymous ' +
            'is still yours to choose; clients say so first. Anyone else\'s card, or none, is `404`.',
          parameters: [cardId],
        },
      ),
      '/cards/{key}/read': {
        post: {
          operationId: 'countCardRead',
          summary: "You are reading this card: counts toward its readCount (204 whatever the card, and whether it counted)",
          description:
            'Call it once the card page shows the card. The server counts each reader at most once per card per UTC day, ' +
            "never the card's author, and only a card you may read (published, not in the trash, public — or for " +
            'connections only and you two connected; a named card across a block either way is not counted, an anonymous ' +
            'one is). The answer is always `204` for a well-formed id — it says nothing about the card — and the counting ' +
            'happens after it. Counted reads spend a daily budget; past it reads go uncounted, still `204`.',
          parameters: [cardId],
          responses: { '204': { description: 'Received' }, ...errors(400, 401) },
        },
      },
      '/cards/{key}/reading': {
        post: {
          operationId: 'reportCardReading',
          summary: 'How you read this card in one page view, as its running totals (204 whatever the card, and whether it was kept)',
          description:
            'Send it when the card page is left or hidden (and again if it comes back and is left again): the `session` is ' +
            "the page view's own id, the numbers its totals so far — never deltas. The server keeps the largest each session " +
            'has said and adds sessions up, so sending one twice counts once. Kept only for picking cards for you; the card\'s ' +
            'author hears at most a weekly count of three readers or more, never a name. Counted only for a card you may read ' +
            "and didn't write (published, not in the trash; a named card across a block either way is not counted, an " +
            'anonymous one is). Numbers out of range are clamped. The answer is always `204` for a well-formed request — it ' +
            'says nothing about the card — and the keeping happens after it; past a daily budget, reports go unkept, still `204`.',
          parameters: [cardId],
          requestBody: { required: true, ...json(ref('ReadingReportRequest')) },
          responses: { '204': { description: 'Received' }, ...errors(400, 401) },
        },
      },
      '/cards/{key}/tap': {
        put: {
          operationId: 'tapCard',
          summary: 'Resonate with a card (共振, the tap): its author is told once, ever, and your face shows to your connections',
          description:
            'Checked in this order: the contract (`400`); your budget (`429`); the card (`404` for one you can\'t read, a ' +
            "draft, one in the trash, or someone else's 私人卡 shared with you in a conversation — a card is never resonated " +
            'with on that pass); your own card (`400`); your pen name (`403 forbidden`, "Choose a pen name first."); a block ' +
            'either way on a named card (`403 blocked`). An anonymous card is answered exactly as without a block — its author ' +
            'just never hears of it. Its author is told after the answer, the first time only: a bell row and a push naming you ' +
            '(never across a block). A tap connects no one and lets the author write to no one. `changed: false` when you ' +
            'already resonated: nothing written, no one told. `409 conflict` is documented for a refusal to come; nothing ' +
            'answers it yet.',
          parameters: [cardId],
          responses: { '200': { description: 'OK', ...json(ref('TapResponse')) }, ...errors(400, 401, 403, 404, 409, 429) },
        },
        delete: {
          operationId: 'untapCard',
          summary: 'Take your resonance with a card back: it tells no one, and you leave its author\'s list and the faces at once',
          description:
            'Checked in this order: the contract (`400`); your budget (`429`); the card (`404` as for `tapCard`); your own card ' +
            '(`400`). It reaches no one: across a block too, and with no pen name. Resonating again tells its author nothing ' +
            '(once, ever). `changed: false` when there was nothing to take back. `403` and `409` are documented for refusals ' +
            'to come; nothing answers them yet.',
          parameters: [cardId],
          responses: { '200': { description: 'OK', ...json(ref('TapResponse')) }, ...errors(400, 401, 403, 404, 409, 429) },
        },
      },
      '/cards/{key}/tap/passage': {
        put: {
          operationId: 'setTapPassage',
          summary: 'Say which part of a card stayed with you, after you resonated: one of its passages, or none (round 27)',
          description:
            "Pick one of `CardDetail.tap.passages` (its `id`), or send `passage: null` to clear your pick. Only the card's " +
            'author learns it — their list of who resonated shows each pick (`TapPerson.passage`); a reader sees only their ' +
            'own. Nothing rings and nothing is counted. Checked in this order: the contract (`400`); your budget (`429`, the ' +
            "tap's); the card (`404` wherever `CardDetail.tap` is null: one you can't read, a draft, one in the trash, your " +
            'own, a named card across a block either way — an anonymous card is answered exactly as without a block); your ' +
            'tap on it is on (`409 conflict` otherwise: resonate first); the passage is one the card offers now (`400` ' +
            'otherwise — the options change when the story does: read the card again). Taking your tap back clears the pick.',
          parameters: [cardId],
          requestBody: { required: true, ...json(ref('TapPassageRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('TapPassageResponse')) }, ...errors(400, 401, 403, 404, 409, 429) },
        },
      },
      '/cards/{key}/taps': get('getCardTaps', 'Who resonated with a card (共振), as you may see them', 'TapList', {
        description:
          "The card's author gets everyone, newest first, 30 a page (pass `nextPageToken` back as `pageToken`), each with " +
          'the excerpt of the latest note they left on a named card (`note`; open your conversation with them) — never across ' +
          'a block, and never a note on an anonymous card. A reader gets the faces of `CardDetail.tap` without its cap: ' +
          'themselves first, then the people they are connected with, in one page, with no notes. `404` wherever ' +
          '`CardDetail.tap` is null. `429` is documented for a budget to come; nothing answers it yet. With `passage` ' +
          "(round 29), the author's pages hold only the people who picked that sentence (`CardDetail.tap.picked`), the " +
          'same rows, order and page size; a reader is answered the same with it or without.',
        parameters: [
          cardId,
          { name: 'pageToken', in: 'query', required: false, description: "A page's `nextPageToken`", schema: { type: 'string', maxLength: 512 } },
          {
            name: 'passage',
            in: 'query',
            required: false,
            description: "For the card's author: only the people who picked this sentence (a `TapPicked.id`). Ignored for a reader.",
            schema: { type: 'string', pattern: '^[0-9a-f]{8}$' },
          },
        ],
      }, [400, 401, 404, 429]),
      '/cards/{key}/related': get('getRelatedCards', 'A few recent cards sharing its tags', 'CardList', { parameters: [cardId] }),
      '/cards/{key}/publish': {
        post: {
          operationId: 'publishCard',
          summary: 'Publish your card: stamps it once, gives it its slug, and lets a resonance reach its original',
          description:
            "A resonance published public under your name reaches the original's author, the first time only: you two connected " +
            '(not when the original is anonymous) and their bell rung — once per reader and card, whatever path rang it first; ' +
            'never across a block, nor without a pen name. A private, connections-only or anonymous one reaches no one. Either ' +
            'way the card is published: reaching out never fails it. An anonymous card is public or private: a draft set to be ' +
            'anonymous and for connections only is `400 invalid_request` ("An anonymous card is public or private.") and stays a draft. ' +
            'A card in the trash is `409 conflict` ("This card is in the trash.") until it is restored.',
          parameters: [pathParam('key', 'The card id')],
          responses: { '200': { description: 'OK', ...json(ref('PublishResponse')) }, ...errors(400, 401, 404, 409) },
        },
      },
      '/cards/{key}/translation': {
        post: {
          operationId: 'translateCard',
          summary: "A published public story translated by AI into the reader's interface language (title and story only)",
          description:
            'For the card page\'s translate line: `to` is the interface language. Checked in this order: the contract (`400`); ' +
            'the card — one you may read, published and public (named or anonymous), not in the trash — else `404`, as for a ' +
            'card that is not there; a story over 30 000 characters is `413`; one already in that language (by its script: a ' +
            'Chinese story goes into English, a Latin-script one into 繁體中文, a Japanese or Korean one into either) `400`. A ' +
            'translation already made for the card as it is now is answered at once and spends nothing; otherwise your ' +
            'translation budget (`429`, 40 a day), then the model: `503` when it failed or ran out of time (nothing kept: ask ' +
            'again later). The answer says nothing about the author. Never cached.',
          parameters: [pathParam('key', 'The card slug or id')],
          requestBody: { required: true, ...json(ref('TranslationRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('TranslationResponse')) }, ...errors(400, 401, 404, 413, 429, 503) },
        },
      },
      '/cards/{key}/edits/apply': {
        post: {
          operationId: 'applyCardEdit',
          summary: 'Apply your pending edit (cards/{id}/edits/current) to your published card, and clear it',
          description:
            "An edit that makes a published resonance public under your name reaches the original's author after the response, " +
            'as a PATCH doing so would (see updateCard); one that leaves it private, connections-only or anonymous takes it ' +
            'back, as that PATCH would. An edit that would leave the card anonymous and for connections only is ' +
            '`400 invalid_request` ("An anonymous card is public or private."), the card and the edit left as they were — unless ' +
            'the card already is so and the edit keeps both. A card in the trash is `409 conflict` ("This card is in the trash.").',
          parameters: [pathParam('key', 'The card id')],
          responses: { '200': { description: 'OK', ...json(ref('ApplyEditResponse')) }, ...errors(400, 401, 404, 409) },
        },
      },
      // --- Phase 2 writer (2a-writer) ---
      '/cards/{key}/draft': {
        patch: {
          operationId: 'saveDraft',
          summary: 'Autosave your draft: only the fields sent, ordered by `rev`',
          description:
            '`rev` counts the client\'s saves of this draft, one higher each time. A save applies only when its `rev` is above ' +
            'the stored one (0 for a new draft); otherwise nothing changes and the answer is `200` with `applied: false` and the ' +
            'stored `rev` — a save that arrived late, or was sent twice, never overwrites newer words. A sent cover replaces the ' +
            'stored one whole (a `frame` left out is removed); `clear` removes the cover or the hue. The fields and limits are ' +
            'the rules\' for a client writing its own card: anything else is `400`. A published card saves through its pending ' +
            'edit (`PUT /cards/{key}/edits/current`): `409 conflict`; a card in the trash is `409 conflict` ("This card is in the ' +
            'trash."); someone else\'s card is `404`. Each applied save is kept 7 days, to bring words back.',
          parameters: [pathParam('key', 'The card id')],
          requestBody: { required: true, ...json(ref('UpdateDraftRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('DraftSaved')) }, ...errors(400, 401, 404, 409, 429) },
        },
      },
      '/cards/{key}/edits/current': {
        ...get('getPendingEdit', 'Your working copy of your published card, or `edit: null`', 'PendingEditBox', {
          description: 'Only yours: someone else\'s card is `404`. Checked each time (ETag → 304).',
          parameters: [pathParam('key', 'The card id')],
        }, [400, 401, 404]),
        put: {
          operationId: 'savePendingEdit',
          summary: 'Autosave your published card\'s working copy, whole, ordered by `rev`',
          description:
            'Readers never see it until you apply it (`POST /cards/{key}/edits/apply`). Applied only when `rev` is above the ' +
            'stored copy\'s (else `200` with `applied: false`, as `PATCH …/draft`). It may keep a card anonymous and for ' +
            'connections only that already is, never make one so (`400 invalid_request`). A card in the trash is `409 conflict`.',
          parameters: [pathParam('key', 'The card id')],
          requestBody: { required: true, ...json(ref('PendingEditRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('DraftSaved')) }, ...errors(400, 401, 404, 409, 429) },
        },
        delete: {
          operationId: 'discardPendingEdit',
          summary: 'Throw your working copy away (the live card is left as it was)',
          parameters: [pathParam('key', 'The card id')],
          responses: { '200': { description: 'OK', ...json(ref('DeletedPendingEdit')) }, ...errors(400, 401, 404) },
        },
      },
      '/me/thought-map': get('getThoughtMap', 'Your whole thought map: nodes, arrows and groups', 'ThoughtMap', {
        description: 'Yours alone. Cards by id only: what each is, `GET /cards?keys=` answers. Checked each time (ETag → 304).',
      }, [401]),
      '/me/thought-map/ops': {
        post: {
          operationId: 'applyThoughtMapOps',
          summary: 'Change your thought map: a batch of ops, in order, all together',
          description:
            'Every op applies, or none does: one the map never takes (an arrow from a card to itself) is `400` and changes ' +
            'nothing. An op on a node, arrow or group that is not there is skipped (its index in `skipped`), so a queue sent ' +
            'again or late does no harm. A group is made under the id the client chose.',
          requestBody: { required: true, ...json(ref('MapOpsRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('MapOpsResponse')) }, ...errors(400, 401, 429) },
        },
      },
      '/cards/{key}/report': {
        post: {
          operationId: 'reportCard',
          summary: 'Report a card you can see (its author, anonymous or not, is filled in by the server)',
          parameters: [pathParam('key', 'The card slug, or its id')],
          requestBody: { required: true, ...json(ref('ReportCardRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('CreateReportResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/reports': {
        post: {
          operationId: 'createReport',
          summary: 'Report a person or a message sent to you (the server keeps a copy of what was reported)',
          requestBody: { required: true, ...json(ref('CreateReportRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('CreateReportResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/links': get('getCardLinks', 'Cards linking to it (empty unless you wrote it)', 'CardList', { parameters: [cardId] }),
      '/users/{handle}': get('getProfile', "A person's profile as you see it", 'Profile', {
        description: 'With `include`, what `/cards` (its first page, of `limit` cards) and `/links` answer come along.',
        parameters: [handle, include(PROFILE_INCLUDES, 'Lists to bring along'), pageParams[0]],
      }),
      '/users/{handle}/cards': get('getProfileCards', 'Their public cards, newest first (never anonymous ones)', 'FeedPage', {
        parameters: [handle, ...pageParams],
      }),
      '/users/{handle}/links': get('getProfileLinks', "Cards by others that link to theirs", 'CardList', { parameters: [handle] }),
      '/invites/{id}/accept': {
        post: {
          operationId: 'acceptInvite',
          summary: "Accept a legacy invite sent to you: connects you two and rings its sender's bell (accepting again changes nothing); it answers a letter waiting between you",
          description:
            '`409 conflict` once it is no longer open: declined, withdrawn, or past its `expiresAt` (it is closed as `expired` then, ' +
            'so inboxes should list only invites before their date). `403 forbidden` without a pen name; `403 blocked` across a ' +
            'block either way.',
          parameters: [pathParam('id', 'The invite id')],
          responses: { '200': { description: 'OK', ...json(ref('AcceptInviteResponse')) }, ...errors(400, 401, 403, 404, 409) },
        },
      },
      '/notes': {
        post: {
          operationId: 'sendNote',
          summary:
            "Send a note to a card's author: rings them and lands in your conversation as a message (`kind: 'note'`, " +
            '`cardRef` = the card). A note is a letter: it connects no one. Between two people not connected it waits in ' +
            'the conversation (`request: { from, cardId, at, count }`) until the author answers it with a message, which ' +
            'connects you (so does a note of theirs to you while yours waits); at most 3 unanswered in all, then 409 ' +
            '`conflict` ("Wait for them to reply."). Either of you may delete the conversation: the writer withdraws the letter, ' +
            'the author declines it, and it can no longer be answered — but the count of 3 is kept apart and goes only when it ' +
            "is answered. Only its recipient answers it: connected some other way (a resonance), it still waits, and the " +
            "recipient's message or note clears it. On an anonymous card: the bell only (`payload.anonymous` true: its push " +
            'opens the card — `data.route` `/card/{cardId}`, no `fromUserId` — and a bell list should open the card too, never ' +
            'a thread with the writer) — no conversation, no connection; ' +
            'across a block it is answered 201 all the same and delivered to no one (a refusal would name its author)',
          description:
            'A `clientId` makes sending retry-safe: it becomes the note\'s id (and its message\'s in the thread), and the same ' +
            'one sent again (a retry after a lost answer) is answered `201` with that id as it was first sent, writing, ' +
            'counting and ringing nothing, while the note is there — whatever has become of the blocks or the card\'s ' +
            'visibility since. A card deleted takes its notes with it: a resend after that is `404`, as any note to a missing ' +
            'card is. Someone else\'s note, or a message already in the two people\'s thread on a named card, is `400` ("Not ' +
            'a valid client id.").',
          requestBody: { required: true, ...json(ref('SendNoteRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('SendNoteResponse')) }, ...errors(400, 401, 403, 404, 409) },
        },
      },
      '/messages': {
        post: {
          operationId: 'sendMessage',
          summary:
            'Message someone you are connected with (opens the conversation; its first message rings their bell), or answer ' +
            "a note they left you while you weren't (`request.from` is them): that answer connects you — and answers it all " +
            'the same once you are',
          description:
            'Checked in this order: the contract (`400`); your message budget (`429`); the request itself (`400`: messaging ' +
            'yourself, no text, no card and no picture, a card and a picture together, a `clientId` or `replyTo` Firestore keeps ' +
            "for itself); `cardRef` (`404` for a card you can't read, or one in the trash; one of your own 私人卡, published or " +
            'never, may be sent — the message is its recipient\'s pass to read it, never to answer it, for as long as the message ' +
            'stands and shares it (`stopSharingCard`) and the card is named and out of the trash, with no block either way; `400`, "An anonymous card is shared ' +
            'only while it is public.", for an anonymous card of yours no one else may read); ' +
            "a `clientId` already used — yours answers `201` as it was first sent, someone else's is `400`; your pen " +
            'name (`403 forbidden`, "Choose a pen name first."); a block either way (`403 blocked`); the connection (`403 ' +
            'forbidden`, "You can message people you are connected with.", unless a letter of theirs waits in your ' +
            'conversation — then your answer connects you); `noteRef`, a note they left you on the card it names (else `400`, ' +
            '"That is not a note they left you."); `replyTo`, a message of this conversation (else `400`); `image`, a picture you ' +
            'uploaded for this conversation and sent with no other message (else `400`, "That is not a picture you can send ' +
            'here."). A reply to a note ' +
            'left on your anonymous card, or to a note no longer there whose card is gone too (deleting a card deletes its ' +
            'notes) or isn\'t yours, is sent without its `noteRef`, saying nothing of the card — and still answers a letter; a ' +
            'note no longer there on your own card, still there, is the `400`. A message from the original\'s author ' +
            'of a resonance standing between you, to its writer, answers that resonance (see `unresonateCard`).',
          requestBody: { required: true, ...json(ref('SendMessageRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('SendMessageResponse')) }, ...errors(400, 401, 403, 404) },
        },
      },
      // --- Phase 2 inbox (2a-inbox)
      '/conversations': get('listConversations', 'Your conversations, the most recently active first (50 a page)', 'ConversationList', {
        description:
          'What the `conversations` listener read: each with your unread count, the last message\'s preview, the letter it ' +
          'holds and the other person as their profile is now (`other: null` when their account is gone). Conversations ' +
          'with people you blocked are listed too, as before: filter them by your blocks. Ask again when `signals/{uid}` ' +
          '`inbox` moves, with `If-None-Match`: an unchanged list is `304`.',
        parameters: [pageTokenParam("A page's `nextPageToken`")],
      }, [400, 401]),
      '/conversations/{pair}/messages': get('listMessages', "A thread's messages, newest first", 'MessagePage', {
        description:
          'No cursor: the newest `limit` (the window to show, and to ask for again with `If-None-Match` when ' +
          '`signals/{uid}` `threads.{pair}` moves: a reaction, an unsend or a link preview changes it too). `before`: the ' +
          'page older than a message (`olderCursor`, or any message\'s `cursor`). `after`: the messages sent right after one ' +
          '(`newerCursor`), oldest of them first in time but answered newest first; `hasNewer` says the page was full. ' +
          'An open thread asks the window once with `changes=1`, then `after` its newest and `updatedAfter` its last ' +
          'answer\'s `updatedCursor`: what came and what changed (a reaction, an unsend, 停止分享), not the window again. ' +
          'Ordered by send time to the microsecond, then id: two messages sent in one millisecond are never skipped. `404` ' +
          'for anyone but its two participants, whether the conversation exists or not.',
        parameters: [
          conversationParam,
          { name: 'before', in: 'query', required: false, description: 'A cursor: the page older than it', schema: { type: 'string', maxLength: 512 } },
          { name: 'after', in: 'query', required: false, description: 'A cursor: what came after it (not with `before`)', schema: { type: 'string', maxLength: 512 } },
          {
            name: 'updatedAfter',
            in: 'query',
            required: false,
            description: 'An answer\'s `updatedCursor`: also answer `updated`, the messages changed since it, of any age (not with `before`)',
            schema: { type: 'string', maxLength: 512 },
          },
          {
            name: 'changes',
            in: 'query',
            required: false,
            description: '`1`: answer an `updatedCursor` (implied by `updatedAfter`); an answer carrying one is never a 304',
            schema: { type: 'string', enum: ['0', '1'] },
          },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: THREAD_PAGE_MAX, default: THREAD_PAGE } },
        ],
      }),
      '/conversations/{pair}/read': {
        post: {
          operationId: 'markConversationRead',
          summary: 'You have read the thread: your unread count in it goes to 0',
          description: 'Nothing changes for the other person. `404` for anyone but its two participants, whether it exists or not.',
          parameters: [conversationParam],
          responses: { '204': { description: 'Read' }, ...errors(400, 401, 404, 429) },
        },
      },
      '/me/bell': get('getBell', 'Your bell, newest first (20 a page)', 'BellPage', {
        description:
          'What the `notifications` listener read, each row\'s payload as the server wrote it (`anonymous` on a note or a ' +
          'resonance on one of your anonymous cards: open the card, never a thread), and the profiles of the people the rows ' +
          'name (a tap row\'s first 3 readers). Ask again when `signals/{uid}` `bell` moves, with `If-None-Match`.',
        parameters: [
          pageTokenParam("A page's `nextPageToken`"),
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: BELL_PAGE_MAX, default: BELL_PAGE } },
        ],
      }, [400, 401]),
      '/notifications/read': {
        post: {
          operationId: 'markNotificationsRead',
          summary: 'Mark bell rows of yours read: by id, or every one up to a time',
          description: "Rows that aren't yours, and ids that name none, are ignored. A row read already keeps the time it was read.",
          requestBody: { required: true, ...json(ref('MarkNotificationsReadRequest')) },
          responses: { '204': { description: 'Read' }, ...errors(400, 401, 429) },
        },
      },
      '/conversations/{pair}': {
        ...get('getConversation', 'One of your conversations, as the list shows it', 'Conversation', {
          description: 'Its letter and your unread count, as the thread reads them. `404` for anyone but its two participants, whether it exists or not.',
          parameters: [conversationParam],
        }),
        delete: {
          operationId: 'deleteConversation',
          summary:
            'Delete a conversation for both of its people: its messages, then the conversation (with a letter that waits in ' +
            'it — the writer withdraws it, its recipient declines it; the count of three unanswered notes is kept apart and ' +
            'stays). Either participant may; for anyone else it is `404`, whether the conversation exists or not. One already ' +
            'gone answers `204` (a retry after a lost answer)',
          parameters: [pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`")],
          responses: { '204': { description: 'Deleted (or already gone)' }, ...errors(400, 401, 404) },
        },
      },
      '/conversations/{pair}/messages/{messageId}/reaction': {
        put: {
          operationId: 'setReaction',
          summary:
            'Answer a message in your conversation with a reaction (one per person per message: a second replaces the ' +
            'first). Quiet: no bell, no push, no unread, the conversation list unchanged',
          description:
            'Checked in this order: the contract (`400`); your reaction budget (`429`); the conversation and the message ' +
            '(`404` for one you are not in, or a message not in it, or unsent); your pen name (`403 forbidden`); a block ' +
            'either way (`403 blocked`); the connection (`403 forbidden` — a letter not yet answered takes no reactions). ' +
            'Your own messages take reactions too.',
          parameters: [
            pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`"),
            pathParam('messageId', "The message's id"),
          ],
          requestBody: { required: true, ...json(ref('SetReactionRequest')) },
          responses: { '204': { description: 'Reacted' }, ...errors(400, 401, 403, 404, 429) },
        },
        delete: {
          operationId: 'removeReaction',
          summary: 'Take your reaction to a message back. One already gone answers `204`',
          parameters: [
            pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`"),
            pathParam('messageId', "The message's id"),
          ],
          responses: { '204': { description: 'Removed (or already gone)' }, ...errors(400, 401, 404) },
        },
      },
      '/conversations/{pair}/messages/{messageId}/unsend': {
        post: {
          operationId: 'unsendMessage',
          summary:
            'Unsend a message you sent, within 24 hours: for both of you it becomes a line saying it was unsent — its ' +
            'words, card, picture and link preview gone, quotes of it emptied. One already unsent answers `204`',
          description:
            'Checked in this order: the contract (`400`); your unsend budget (`429`); the message (`404` unless it is yours, ' +
            'in this conversation); a note (`400`, "A note can\'t be unsent."); its age (`409 conflict`, "This message can ' +
            'no longer be unsent." past 24 hours). The server keeps what it said for 30 days, read only by moderation when ' +
            'the conversation is reported.',
          parameters: [
            pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`"),
            pathParam('messageId', "The message's id"),
          ],
          responses: { '204': { description: 'Unsent (or already unsent)' }, ...errors(400, 401, 404, 409, 429) },
        },
      },
      '/conversations/{pair}/shared-cards/{cardId}': {
        delete: {
          operationId: 'stopSharingCard',
          summary:
            'Stop sharing your 私人卡 in this conversation (停止分享): every message of yours here that shares it stops being ' +
            "the other person's pass to read it — any time, not only within unsend's 24 hours. The messages stay; the card " +
            'reads to them as one they cannot read. Sending it again shares it again. Nothing to stop answers `204`',
          description:
            'Checked in this order: the contract (`400`); your budget (`429`); the conversation (`404` for one you are not in, ' +
            'whether it exists or not). Across a block too: it reaches no one.',
          parameters: [
            pathParam('pair', "The conversation's id: its two participants' uids, sorted, joined by `_`"),
            pathParam('cardId', "The card's id"),
          ],
          responses: { '204': { description: 'No message here shares it any longer' }, ...errors(400, 401, 404, 429) },
        },
      },
      '/chat-images': {
        post: {
          operationId: 'uploadChatImage',
          summary: 'Upload a picture to send in a conversation (then send it: `sendMessage` with `image`)',
          description:
            'The picture is kept upright, at most 2048 px on its longest side, as WebP without its metadata (place, camera); ' +
            'an animated GIF stays animated. Only the two people of the conversation can read it, once it is sent ' +
            '(`getChatImage`). Checked in this order: a request over 4 MB (`400`); the form (`400`: no file, a file over 4 ' +
            'MB, a `to` or `clientId` that is not one); a `clientId` already used — yours answers `201` as it was first ' +
            'uploaded, spending nothing; someone else\'s is `400`; your picture budget (`429`); your pen name (`403 ' +
            'forbidden`); a block either way (`403 blocked`); whether you may message `to` at all (`403 forbidden`, as ' +
            '`sendMessage` says it); the picture itself (`400`: not a JPEG, PNG, WebP or GIF, or more than 50 megapixels). ' +
            'A picture never sent is deleted after a day.',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file', 'to'],
                  properties: {
                    file: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP or GIF, at most 4 MB' },
                    to: { type: 'string', description: "The other person's user id" },
                    clientId: {
                      type: 'string',
                      description:
                        "The sender's own id for this picture (16–64 of A–Z a–z 0–9 _ -), kept for every retry: it becomes the " +
                        "picture's id, so uploading it again after a lost answer finds the one already kept",
                    },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Uploaded', ...json(ref('ChatImageResponse')) }, ...errors(400, 401, 403, 429) },
        },
      },
      '/chat-images/{id}': {
        get: {
          operationId: 'getChatImage',
          summary: 'A picture sent in one of your conversations',
          description:
            'For the two people of its conversation, while the message that carries it is there (a deleted conversation ' +
            'takes its pictures with it); `404` for anything else, never saying why. The bytes never change: keep them.',
          parameters: [
            pathParam('id', 'The picture id (a message\'s `image.id`)'),
            {
              name: 'size',
              in: 'query',
              required: false,
              description: '`thumb`: at most 960 px on its longest side, for the thread; `full` (the default): as kept',
              schema: { type: 'string', enum: ['full', 'thumb'], default: 'full' },
            },
          ],
          responses: {
            '200': { description: 'The picture', content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } } },
            ...errors(401, 404),
          },
        },
      },
      '/me/notifications': {
        get: {
          operationId: 'getNotificationSettings',
          summary: 'Which pushes this account wants',
          description:
            '`picks` and `connectionCards` are off until turned on; `messages` (messages and notes) is on until turned off ' +
            '(an account that never set them reads those two off and messages on).',
          responses: { '200': { description: 'OK', ...json(ref('NotificationSettings')) }, ...errors(401) },
        },
        patch: {
          operationId: 'updateNotificationSettings',
          summary: 'Turn "a card for tonight", "new cards from your connections" or message pushes on or off',
          description:
            'Only the switches sent change (`null` or absent leaves one as it is); turning one on records when. ' +
            'Answers the settings as they are now. Ask for the OS permission before turning one on: the server ' +
            'cannot tell whether this install may show notifications.',
          requestBody: { required: true, ...json(ref('UpdateNotificationSettingsRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('NotificationSettings')) }, ...errors(400, 401) },
        },
      },
      '/me/devices/{installationId}': {
        put: {
          operationId: 'registerDevice',
          summary: "Register this install's push token (it moves to you if someone else was signed in on it)",
          parameters: [pathParam('installationId', "The install's own stable id (8–128 of A–Z a–z 0–9 _ . : -)")],
          requestBody: { required: true, ...json(ref('RegisterDeviceRequest')) },
          responses: { '204': { description: 'Registered' }, ...errors(400, 401) },
        },
        delete: {
          operationId: 'unregisterDevice',
          summary: 'On sign-out: stop pushing to this install',
          parameters: [pathParam('installationId', "The install's own stable id")],
          responses: { '204': { description: 'Removed (or it was not yours)' }, ...errors(400, 401) },
        },
      },
      // --- Phase 2 social (2a-social)
      '/client-config': {
        get: {
          operationId: 'getClientConfig',
          summary: 'What an app asks at launch: the builds that must or should update, and which paths to take',
          description:
            'No sign-in needed; the same for everyone (`Cache-Control: public, s-maxage=60`, an `ETag`, `304` on a match). ' +
            'A build below `minBuild` for its platform shows the update screen and goes no further; one below ' +
            '`recommendedBuild` may say an update is waiting. `features`: each flag true takes the /api/v1 path, false the older one.',
          security: [],
          responses: { '200': { description: 'OK', ...json(ref('ClientConfig')) } },
        },
      },
      '/users': get('getUsers', 'Profiles by id, at most 30, in the order asked', 'PersonList', {
        description:
          'Each id once, in the order asked; an account that is gone (deleted, or never was) comes back `gone` with nothing ' +
          'else. A profile is public: a block changes nothing here. `429` past the hourly budget.',
        parameters: [{ name: 'ids', in: 'query', required: true, description: 'User ids, comma-separated (1–30)', schema: { type: 'string' } }],
      }, [400, 401, 429]),
      '/me/bookmarks/{cardId}': {
        put: {
          operationId: 'putBookmark',
          summary: 'Bookmark a card you may read (again: unchanged)',
          description: '`404` for a card you may not read, exactly as GET /cards/{key} answers it. Your bookmarks are yours alone: no one is told.',
          parameters: [pathParam('cardId', 'The card id')],
          responses: { '204': { description: 'Bookmarked' }, ...errors(400, 401, 404, 429) },
        },
        delete: {
          operationId: 'deleteBookmark',
          summary: 'Take a bookmark back (whether or not there was one)',
          parameters: [pathParam('cardId', 'The card id')],
          responses: { '204': { description: 'Not bookmarked' }, ...errors(400, 401, 429) },
        },
      },
      '/me/blocks': get('getBlocks', 'Everyone you blocked, the latest first', 'BlockList', {}, [401]),
      '/me/blocks/{uid}': {
        put: {
          operationId: 'blockUser',
          summary: 'Block someone: the connection ends and every pending invite between you is withdrawn, at once',
          description: 'They are never told. Blocking again changes nothing; yourself is `400`.',
          parameters: [pathParam('uid', 'Their user id')],
          responses: { '204': { description: 'Blocked' }, ...errors(400, 401, 429) },
        },
        delete: {
          operationId: 'unblockUser',
          summary: 'Unblock someone: only the block goes (a connection it ended stays ended)',
          parameters: [pathParam('uid', 'Their user id')],
          responses: { '204': { description: 'Not blocked' }, ...errors(400, 401, 429) },
        },
      },
      '/me/connections': get('getConnections', 'The people you are connected with, the latest first', 'ConnectionList', {}, [401]),
      '/invites': get('getInvites', 'Legacy invites waiting for your answer (pending and before their date), the latest first', 'InviteList', {
        parameters: [{ name: 'box', in: 'query', required: true, schema: { type: 'string', enum: ['incoming'] } }],
      }, [400, 401]),
      '/invites/{id}/decline': {
        post: {
          operationId: 'declineInvite',
          summary: 'Say no to a legacy invite sent to you: it closes, and no one is told (again: unchanged)',
          description: '`404` for an invite that is not yours to answer; `409` once it closed otherwise (accepted, withdrawn, expired).',
          parameters: [pathParam('id', 'The invite id')],
          responses: { '204': { description: 'Declined' }, ...errors(400, 401, 404, 409, 429) },
        },
      },
      // --- end Phase 2 social (2a-social)
      // --- Phase 3 sessions (ADR 0004)
      '/auth/exchange': {
        post: {
          operationId: 'exchangeSession',
          summary: "Trade a sign-in at the identity provider (a Firebase ID token) for Resonance's own tokens",
          description:
            'The token is checked as a write would check it (a disabled or revoked account is `401`). Answers a ' +
            'short-lived access token — sent as the bearer credential, where a Firebase ID token is sent today; both ' +
            'are accepted — and a refresh token. `userId` is the account id the sign-in always had. `503` where ' +
            'sessions are not enabled: keep sending the Firebase ID token. `429` past the hourly budget.',
          security: [],
          requestBody: { required: true, ...json(ref('AuthExchangeRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('AuthSession')) }, ...errors(400, 401, 429, 503) },
        },
      },
      '/auth/refresh': {
        post: {
          operationId: 'refreshSession',
          summary: 'Trade a refresh token for the next access and refresh tokens (each refresh token is good once)',
          description:
            'A refresh token presented a second time is taken for stolen: every token of its session is revoked, and ' +
            'this answers `401` (sign in again, then exchange). So does an account deleted, disabled or signed out ' +
            'everywhere since. `503` where sessions are not enabled.',
          security: [],
          requestBody: { required: true, ...json(ref('AuthRefreshRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('AuthSession')) }, ...errors(400, 401, 429, 503) },
        },
      },
      '/auth/logout': {
        post: {
          operationId: 'logoutSession',
          summary: "End this device's session: its refresh token, and every one rotated from the same exchange, revoked",
          description: 'The access token already handed out stands until it expires (at most 15 minutes). An unknown token answers the same.',
          security: [],
          requestBody: { required: true, ...json(ref('AuthRefreshRequest')) },
          responses: { '204': { description: 'Logged out' }, ...errors(400) },
        },
      },
      // --- end Phase 3 sessions
    },
    components: {
      securitySchemes: { firebaseIdToken: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } },
      schemas: components,
    },
  };
}
