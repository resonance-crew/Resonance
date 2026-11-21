-- Phase 3 sessions (ADR 0004), merged beside the adapter: the refresh tokens get a table of their own (the id
-- is the token's SHA-256; single use; `expires_at` swept like the other TTL columns).

create table refresh_tokens (
  id         text primary key,
  uid        text not null,
  family     text not null,
  auth_time  bigint,
  created_at timestamptz,
  expires_at timestamptz,
  used_at    timestamptz,
  extra      jsonb not null default '{}'
);
create index refresh_tokens_uid on refresh_tokens (uid);
create index refresh_tokens_family on refresh_tokens (family);
create index refresh_tokens_expire on refresh_tokens (expires_at);

-- The daily sweep takes expired refresh tokens too (Firestore's TTL on refreshTokens.expiresAt).
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
  delete from refresh_tokens where expires_at < now_at; get diagnostics n = row_count; gone := gone + n;
  return gone;
end $$;
