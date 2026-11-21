// Tombstones and retired slugs: Firestore code, so it lives in the cards
// repository (src/server/infra/firestore/repos/cards.ts); this path stays for
// its importers (deleteCard, the account purge, scripts/backfills).
export { RETIRED_SLUG, retirable, retiredSlugRef, TOMBSTONE, tombstoneRef } from '@/server/infra/firestore/repos/cards';
