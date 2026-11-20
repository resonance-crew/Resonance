// Which card a URL segment names. Firestore code, so it lives in the cards
// repository (src/server/infra/firestore/repos/cards.ts); this path stays for
// its importers. Services ask `ctx.data.cards.findByKey` / `findForAnyone`.
export { anonymousBySlug, cardByKey, cardByKeyForAnyone, slugHolder, slugShaped } from '@/server/infra/firestore/repos/cards';
