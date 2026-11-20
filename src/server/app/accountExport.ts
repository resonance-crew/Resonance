import type { ServerCtx } from '@/server/ctx';
import { exportSection, type ExportSection } from '@/server/domain/schema/registry';
import type { ExportRow } from '@/server/ports/repos/account';

/**
 * A downloadable copy of everything the user wrote — offered before account
 * deletion ("download a backup first") and useful on its own. Only the user's
 * own words: other people's messages and notes are not included. Beside them,
 * what the service records of them on its own (round 26): the cards they
 * resonated with, and how they read cards (the privacy policy says both).
 *
 * Which entity feeds each section, and how the account's rows are found,
 * is the registry's (`EXPORT_SECTIONS`); the shape of each row is here.
 * It is made as a stream of JSON text: the collections are read a page at a
 * time and written out as they come, so a prolific writer's backup neither
 * sits whole in the function's memory nor runs into the platform's limit on
 * a buffered response body (about 4.5 MB on Vercel).
 */

type Row = Record<string, unknown>;

/** A JSON array of rows, a page at a time. */
async function* array(...sources: AsyncIterable<Row[]>[]): AsyncGenerator<string> {
  let first = true;
  yield '[';
  for (const source of sources) {
    for await (const rows of source) {
      if (!rows.length) continue;
      yield (first ? '' : ',') + rows.map((r) => JSON.stringify(r)).join(',');
      first = false;
    }
  }
  yield ']';
}

const asRow = (r: ExportRow): Row => ({ id: r.id, ...r.data });

function omitting(row: Row, keys: readonly string[] | undefined): Row {
  for (const key of keys ?? []) delete row[key];
  return row;
}

/** The section's rows as kept, less its omitted fields (`extra` first: messages' conversationId). */
async function* rows(ctx: ServerCtx, section: ExportSection, uid: string, treeId?: string, extra: Row = {}): AsyncGenerator<Row[]> {
  for await (const page of ctx.data.account.exportRows(section, uid, treeId)) {
    yield page.map((r) => omitting({ ...extra, ...asRow(r) }, section.omit));
  }
}

/** The cards the account resonated with (on only), a page at a time: `{ cardId, title, link, at }`. */
async function* tapRows(ctx: ServerCtx, section: ExportSection, uid: string): AsyncGenerator<Row[]> {
  for await (const page of ctx.data.account.exportRows(section, uid)) {
    const on = page.filter((r) => r.data.on === true && typeof r.data.cardId === 'string');
    const lines = await ctx.data.account.cardLines(uid, on.map((r) => r.data.cardId as string));
    yield on.map((r) => ({ ...lines.get(r.data.cardId as string), at: r.data.at ?? null }));
  }
}

/** The account's reading records, a page at a time: what was kept, beside the card's title and link. */
async function* readingRows(ctx: ServerCtx, section: ExportSection, uid: string): AsyncGenerator<Row[]> {
  for await (const page of ctx.data.account.exportRows(section, uid)) {
    const lines = await ctx.data.account.cardLines(uid, page.map((r) => String(r.data.cardId ?? '')));
    yield page.map((r) => {
      const kept = omitting(asRow(r), section.omit);
      delete kept.id;
      return { ...lines.get(String(r.data.cardId ?? '')), ...kept, keptUntil: r.data.expireAt ?? null };
    });
  }
}

/**
 * The export, as JSON text in pieces (lib/account/export AccountExport once
 * joined). The first piece comes after the profile is read, so a caller
 * that waits for it before answering turns a failure to start into an error
 * status rather than a broken file.
 */
export async function* exportAccountJsonIn(ctx: ServerCtx, uid: string, now = new Date()): AsyncGenerator<string> {
  const profile = await ctx.data.account.exportDoc(exportSection('profile'), uid);
  yield `{"exportedAt":${JSON.stringify(now.toISOString())},"profile":${JSON.stringify(profile)}`;

  yield ',"cards":';
  yield* array(rows(ctx, exportSection('cards'), uid));
  yield ',"bookmarks":';
  yield* array(rows(ctx, exportSection('bookmarks'), uid));
  yield ',"thoughtMap":{"nodes":';
  yield* array(rows(ctx, exportSection('thoughtMap.nodes'), uid));
  yield ',"edges":';
  yield* array(rows(ctx, exportSection('thoughtMap.edges'), uid));
  yield ',"groups":';
  yield* array(rows(ctx, exportSection('thoughtMap.groups'), uid));
  yield '},"notesSent":';
  yield* array(rows(ctx, exportSection('notesSent'), uid));

  yield ',"messagesSent":';
  const messages = exportSection('messagesSent');
  const tag = messages.find.kind === 'inTrees' ? messages.find.tag : 'treeId';
  const trees = await ctx.data.account.exportTrees(messages, uid);
  yield* array(...trees.map((id) => rows(ctx, messages, uid, id, { [tag]: id })));
  yield ',"cardsResonated":';
  yield* array(tapRows(ctx, exportSection('cardsResonated'), uid));
  yield ',"reading":';
  yield* array(readingRows(ctx, exportSection('reading'), uid));
  yield '}';
}
