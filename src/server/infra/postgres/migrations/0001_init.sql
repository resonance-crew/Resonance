-- 0001_init: every entity of src/server/domain/schema/registry.ts as a table
-- (appendix E of the middleware-refactor plan), plus the adapter's own.
--
-- Conventions:
-- * ids stay the Firestore id strings (text): URLs, slugs, pair ids and the
--   ids the apps hold don't change. A deterministic Firestore id used as a
--   uniqueness / idempotency key (handles/{lower}, letters/{w}_{r},
--   resonanceTaps/{card}_{uid}, notifications/resonance_{uid}_{card},
--   rtap_{card}_{day}, clientId as a message id, rateLimits/{uid}_{bucket})
--   is the primary key, so `insert … on conflict` is what `ref.create()` was.
-- * timestamptz holds microseconds.
-- * the columns are what is queried, indexed, unique or checked; every other
--   field of a document lives, losslessly, in `extra jsonb`
--   (src/server/infra/postgres/schema.ts, codec.ts).
-- * no foreign keys between aggregates: the services keep today's order of
--   writes (a card may name an author whose profile is written after it, a
--   purge deletes in the registry's order); children of one aggregate cascade.
-- * TTL columns (`expire_at`, `until`, `unsent_at`) are swept by
--   `resonance_ttl_sweep()` below, run daily (docs/ops/postgres.md).

create extension if not exists vector;

-- --- users ---------------------------------------------------------------

create table users (
  id                text primary key,
  handle            text,
  handle_lower      text,
  bio               text,
  region            text,
  primary_locale    text,
  auto_translate_to text,
  avatar_key        text,
  avatar_url        text,
  avatar_seed       text,
  initials          text,
  accent_color      text,
  hints_seen        jsonb,
  joined_at         timestamptz,
  updated_at        timestamptz,
  schema_version    int not null default 1,
  extra             jsonb not null default '{}'
);
create unique index users_handle_lower on users (handle_lower) where handle_lower is not null and handle_lower <> '';

create table bookmarks (
  user_id    text not null,
  card_id    text not null,
  created_at timestamptz,
  extra      jsonb not null default '{}',
  primary key (user_id, card_id)
);
create index bookmarks_card on bookmarks (card_id);

-- Both columns name a person: an account's purge deletes the rows it owns and the rows naming it.
create table blocks (
  owner_id   text not null,
  blocked_id text not null,
  created_at timestamptz,
  extra      jsonb not null default '{}',
  primary key (owner_id, blocked_id)
);
create index blocks_blocked on blocks (blocked_id);

-- The pen name's reservation: the primary key is the uniqueness (was: the document id).
create table handles (
  handle_lower text primary key,
  user_id      text,
  handle       text,
  extra        jsonb not null default '{}'
);
create index handles_user on handles (user_id);

-- Phase 2's signal channel (ports/realtime.ts): counters only.
create table signals (
  user_id text primary key,
  v       int,
  inbox   bigint,
  bell    bigint,
  graph   bigint,
  map     bigint,
  drafts  bigint,
  threads jsonb,
  at      timestamptz,
  extra   jsonb not null default '{}'
);

-- 90 days: swept by `until`.
create table handle_holds (
  name     text primary key,
  held_for text,
  until    timestamptz,
  extra    jsonb not null default '{}'
);
create index handle_holds_held_for on handle_holds (held_for);
create index handle_holds_until on handle_holds (until);

create table identities (
  provider text not null,
  subject  text not null,
  user_id  text not null,
  created_at timestamptz not null default now(),
  extra    jsonb not null default '{}',
  primary key (provider, subject)
);
create index identities_user on identities (user_id);

-- --- cards ---------------------------------------------------------------

create table cards (
  id                text primary key,
  author_id         text,
  slug              text,
  title             text,
  thought_core      text,
  story             text,
  story_type        text,
  visibility        text check (visibility in ('public', 'connections', 'private')),
  anonymous         boolean,
  reference_card_id text,
  published_at      timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,
  excerpt           text,
  read_minutes      int,
  read_count        int,
  media             jsonb,
  tags              text[],
  signature         jsonb,
  index_pending_at  timestamptz,
  trashed_at        timestamptz,
  trashed_from      jsonb,
  schema_version    int not null default 1,
  extra             jsonb not null default '{}'
);
-- An anonymous card is public or private, never connections-only (the safety rules, once more in the database).
-- `not valid`: the published anonymous connections-only cards of before (scripts/integrity.ts) are kept as they are.
alter table cards add constraint anonymous_not_connections
  check (not (coalesce(anonymous, false) and visibility = 'connections' and published_at is not null)) not valid;
create unique index cards_slug on cards (slug) where slug is not null;
create index cards_public_feed on cards (visibility, anonymous, published_at desc) where trashed_at is null;
create index cards_author on cards (author_id, published_at desc);
create index cards_author_trash on cards (author_id, trashed_at desc) where trashed_at is not null;
create index cards_reference on cards (reference_card_id, visibility, anonymous, published_at desc) where reference_card_id is not null;
create index cards_author_reference on cards (author_id, reference_card_id) where reference_card_id is not null;

create table card_edits (
  card_id    text not null references cards (id) on delete cascade,
  edit_id    text not null,
  author_id  text,
  updated_at timestamptz,
  extra      jsonb not null default '{}',
  primary key (card_id, edit_id)
);
create index card_edits_author on card_edits (author_id);

create table card_translations (
  card_id    text not null references cards (id) on delete cascade,
  locale     text not null,
  updated_at timestamptz,
  extra      jsonb not null default '{}',
  primary key (card_id, locale)
);

-- 7 days: swept by `expire_at`.
create table card_draft_log (
  card_id   text not null references cards (id) on delete cascade,
  rev       text not null,
  author_id text,
  expire_at timestamptz,
  extra     jsonb not null default '{}',
  primary key (card_id, rev)
);
create index card_draft_log_author on card_draft_log (author_id);
create index card_draft_log_expire on card_draft_log (expire_at);

-- Kept for good.
create table card_tombstones (card_id text primary key, at timestamptz, extra jsonb not null default '{}');
create table retired_slugs (slug text primary key, at timestamptz, extra jsonb not null default '{}');

create table card_links (
  id               text primary key,
  source_card_id   text,
  target_card_id   text,
  source_author_id text,
  target_author_id text,
  created_at       timestamptz,
  extra            jsonb not null default '{}'
);
create unique index card_links_pair on card_links (source_card_id, target_card_id);
create index card_links_target on card_links (target_card_id, created_at desc);
create index card_links_target_author on card_links (target_author_id, created_at desc);
create index card_links_source_author on card_links (source_author_id);

-- --- graph ---------------------------------------------------------------

-- `userIds[]` → two columns (a < b, as the pair id).
create table connections (
  pair_id        text primary key,
  user_a         text,
  user_b         text,
  established_at timestamptz,
  extra          jsonb not null default '{}',
  check (user_a is null or user_b is null or user_a < user_b)
);
create index connections_a on connections (user_a);
create index connections_b on connections (user_b);

-- The reasons of a connection: `resonance_cards` is the in-transaction `array-contains` (a GIN index lookup now).
create table connection_origins (
  pair_id         text primary key,
  user_a          text,
  user_b          text,
  reasons         jsonb,
  resonance_cards text[],
  extra           jsonb not null default '{}'
);
create index connection_origins_a on connection_origins (user_a);
create index connection_origins_b on connection_origins (user_b);
create index connection_origins_cards on connection_origins using gin (resonance_cards);

create table invites (
  id                text primary key,
  from_user_id      text,
  to_user_id        text,
  status            text,
  reference_card_id text,
  created_at        timestamptz,
  expires_at        timestamptz,
  extra             jsonb not null default '{}'
);
create index invites_to on invites (to_user_id, status, created_at desc);
create index invites_from on invites (from_user_id, to_user_id, status);

-- letters/{w}_{r}: the pair of the two is the key.
create table letters (
  from_id    text not null,
  to_id      text not null,
  count      int,
  updated_at timestamptz,
  extra      jsonb not null default '{}',
  primary key (from_id, to_id)
);
create index letters_to on letters (to_id);

-- Old data, read only.
create table legacy_resonances (
  id         text primary key,
  card_id    text,
  user_id    text,
  created_at timestamptz,
  extra      jsonb not null default '{}'
);
create index legacy_resonances_card on legacy_resonances (card_id);
create index legacy_resonances_user on legacy_resonances (user_id);

-- `withheld_for` never leaves the server (no answer, no export).
create table notes (
  id           text primary key,
  card_id      text,
  from_user_id text,
  to_user_id   text,
  withheld_for text,
  text         text,
  created_at   timestamptz,
  read_at      timestamptz,
  extra        jsonb not null default '{}'
);
create index notes_card on notes (card_id, from_user_id);
create index notes_to on notes (to_user_id);
create index notes_from on notes (from_user_id);
create index notes_withheld on notes (withheld_for) where withheld_for is not null;

-- --- conversations -------------------------------------------------------

create table conversations (
  pair_id      text primary key,
  user_a       text,
  user_b       text,
  last_message jsonb,
  request      jsonb,
  updated_at   timestamptz,
  extra        jsonb not null default '{}'
);
create index conversations_a on conversations (user_a, updated_at desc);
create index conversations_b on conversations (user_b, updated_at desc);

create table messages (
  pair_id   text not null,
  id        text not null,
  sender_id text,
  sent_at   timestamptz,
  text      text,
  kind      text,
  unsent_at timestamptz,
  extra     jsonb not null default '{}',
  primary key (pair_id, id)
);
create index messages_page on messages (pair_id, sent_at desc, id desc);
create index messages_sender on messages (sender_id);

-- `reactions{uid}` as rows: one person's reaction is written alone (messages.setReaction).
create table message_reactions (
  pair_id    text not null,
  message_id text not null,
  user_id    text not null,
  reaction   text not null,
  primary key (pair_id, message_id, user_id),
  foreign key (pair_id, message_id) references messages (pair_id, id) on delete cascade
);
create index message_reactions_user on message_reactions (user_id);

-- 30 days: swept by `unsent_at`.
create table unsent_messages (
  pair_id    text not null,
  message_id text not null,
  sender_id  text,
  to_id      text,
  unsent_at  timestamptz,
  extra      jsonb not null default '{}',
  primary key (pair_id, message_id)
);
create index unsent_messages_at on unsent_messages (unsent_at);
create index unsent_messages_sender on unsent_messages (sender_id);
create index unsent_messages_to on unsent_messages (to_id);

create table private_shares (card_id text primary key, author_id text, extra jsonb not null default '{}');
create index private_shares_author on private_shares (author_id);

create table chat_images (
  id         text primary key,
  sender_id  text,
  to_id      text,
  key        text,
  unsent_at  timestamptz,
  created_at timestamptz,
  extra      jsonb not null default '{}'
);
create index chat_images_sender on chat_images (sender_id);
create index chat_images_to on chat_images (to_id);
create index chat_images_unsent on chat_images (unsent_at);

-- --- taps, reading -------------------------------------------------------

create table resonance_taps (
  card_id text not null,
  user_id text not null,
  "on"    boolean,
  at      timestamptz,
  rang_at timestamptz,
  extra   jsonb not null default '{}',
  primary key (card_id, user_id)
);
create index resonance_taps_list on resonance_taps (card_id, "on", at desc, user_id desc);
create index resonance_taps_user on resonance_taps (user_id);

-- TTL: swept by `expire_at`.
create table reader_signals (
  user_id          text not null,
  card_id          text not null,
  expire_at        timestamptz,
  expected_seconds int,
  report_day       text,
  reports_today    int,
  extra            jsonb not null default '{}',
  primary key (user_id, card_id)
);
create index reader_signals_card on reader_signals (card_id);
create index reader_signals_expire on reader_signals (expire_at);

-- One marker per reader and card (its `day` replaced): TTL by `expire_at`.
create table card_reads (
  user_id   text not null,
  card_id   text not null,
  day       text,
  expire_at timestamptz,
  extra     jsonb not null default '{}',
  primary key (user_id, card_id)
);
create index card_reads_card on card_reads (card_id);
create index card_reads_expire on card_reads (expire_at);

-- --- bell ----------------------------------------------------------------

-- The deterministic ids (resonance_{uid}_{card}, rtap_{card}_{day}, rsum_…) are the primary key, as before.
create table notifications (
  id         text primary key,
  user_id    text,
  type       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz,
  extra      jsonb not null default '{}'
);
create index notifications_user on notifications (user_id, created_at desc);
create index notifications_from on notifications ((payload ->> 'fromUserId'));
create index notifications_from_many on notifications using gin ((payload -> 'fromUserIds'));

-- --- thought map (a map's parts are rows: each is written alone) ----------

create table thought_maps (user_id text primary key, updated_at timestamptz, extra jsonb not null default '{}');
create table map_nodes (user_id text not null, id text not null, updated_at timestamptz, extra jsonb not null default '{}', primary key (user_id, id));
create table map_edges (user_id text not null, id text not null, updated_at timestamptz, extra jsonb not null default '{}', primary key (user_id, id));
create table map_groups (user_id text not null, id text not null, updated_at timestamptz, extra jsonb not null default '{}', primary key (user_id, id));

-- --- safety --------------------------------------------------------------

create table reports (
  id             text primary key,
  reporter_id    text,
  target_user_id text,
  target_id      text,
  status         text,
  created_at     timestamptz,
  extra          jsonb not null default '{}'
);
create index reports_status on reports (status, created_at);
create index reports_reporter on reports (reporter_id);

-- Frozen: its picture URLs are never rewritten.
create table report_evidence (
  report_id      text primary key,
  reporter_id    text,
  target_user_id text,
  extra          jsonb not null default '{}'
);
create index report_evidence_reporter on report_evidence (reporter_id);
create index report_evidence_target on report_evidence (target_user_id);

create table account_deletions (
  user_id      text primary key,
  purge_after  timestamptz,
  requested_at timestamptz,
  extra        jsonb not null default '{}'
);
create index account_deletions_purge on account_deletions (purge_after);

-- --- infra ---------------------------------------------------------------

create table rate_limits (
  user_id      text not null,
  bucket       text not null,
  window_start bigint,
  used         int,
  extra        jsonb not null default '{}',
  primary key (user_id, bucket)
);

create table legacy_quotas (id text primary key, user_id text, extra jsonb not null default '{}');
create index legacy_quotas_user on legacy_quotas (user_id);

create table uploads (
  id         text primary key,
  owner_id   text,
  key        text,
  created_at timestamptz,
  extra      jsonb not null default '{}'
);
create unique index uploads_key on uploads (key) where key is not null;
create index uploads_owner on uploads (owner_id);

create table config (key text primary key, extra jsonb not null default '{}');

-- --- push ----------------------------------------------------------------

create table devices (
  installation_id text primary key,
  user_id         text,
  platform        text,
  locale          text,
  token           text,
  updated_at      timestamptz,
  extra           jsonb not null default '{}'
);
create index devices_user on devices (user_id);
create index devices_updated on devices (updated_at);

create table notification_settings (user_id text primary key, extra jsonb not null default '{}');
create table pick_pushes (user_id text primary key, extra jsonb not null default '{}');
create table connection_card_pushes (user_id text primary key, extra jsonb not null default '{}');

-- --- recommend -----------------------------------------------------------

create table card_vectors (
  card_id     text not null,
  channel     text not null check (channel in ('insight', 'situation')),
  part        int not null,
  author_id   text,
  visibility  text,
  vector      vector(1536),
  embed_model text,
  extra       jsonb not null default '{}',
  primary key (card_id, channel, part)
);
create index card_vectors_knn on card_vectors using hnsw (vector vector_cosine_ops);
create index card_vectors_filter on card_vectors (visibility, channel);
create index card_vectors_author on card_vectors (author_id);

create table card_signatures (card_id text primary key, author_id text, extra jsonb not null default '{}');
create index card_signatures_author on card_signatures (author_id);
create table user_profiles (user_id text primary key, extra jsonb not null default '{}');
create table recommendations (user_id text primary key, date text, extra jsonb not null default '{}');

-- --- outbox (Phase 3) ----------------------------------------------------

-- What changed, never the content: the replicator reads the source's latest row.
create table change_log (
  id        text primary key,            -- ulid: time ordered
  entity    text not null,
  row_id    text not null,
  op        text not null check (op in ('upsert', 'delete')),
  version   bigint not null,
  at        timestamptz not null default now(),
  done      boolean not null default false,
  expire_at timestamptz,
  user_ids  text[],
  extra     jsonb not null default '{}'
);
create index change_log_pending on change_log (id) where not done;
create index change_log_users on change_log using gin (user_ids);
create index change_log_expire on change_log (expire_at);

-- --- the adapter's own ---------------------------------------------------

-- LeaseStore: one row per key (a row path, `recommendations/{uid}`).
create table leases (
  key         text primary key,
  lease_until timestamptz not null
);

-- What the replicator applied to this database, by row: a replayed or older change never overwrites a newer one.
create table replica_versions (
  entity  text not null,
  row_id  text not null,
  version bigint not null,
  primary key (entity, row_id)
);

-- The UnitOfWork contract's test-only table (src/server/contract/probe.ts).
create table probe (key text primary key, n bigint, extra jsonb not null default '{}');

-- --- TTL ------------------------------------------------------------------

-- Firestore's TTL policies, as one daily sweep (docs/ops/postgres.md): answers how many rows went.
create or replace function resonance_ttl_sweep(now_at timestamptz default now()) returns bigint
language plpgsql as $$
declare
  gone bigint := 0;
  n bigint;
begin
  delete from reader_signals where expire_at < now_at; get diagnostics n = row_count; gone := gone + n;
  delete from card_reads where expire_at < now_at; get diagnostics n = row_count; gone := gone + n;
  delete from card_draft_log where expire_at < now_at; get diagnostics n = row_count; gone := gone + n;
  delete from change_log where done and expire_at < now_at; get diagnostics n = row_count; gone := gone + n;
  delete from handle_holds where until < now_at; get diagnostics n = row_count; gone := gone + n;
  delete from unsent_messages where unsent_at < now_at - interval '30 days'; get diagnostics n = row_count; gone := gone + n;
  delete from leases where lease_until < now_at; get diagnostics n = row_count; gone := gone + n;
  return gone;
end $$;
