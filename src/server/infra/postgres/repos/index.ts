import { docIdOk } from '@/server/domain/cards';
import type { DataRepos, TxRepos } from '@/server/ports/uow';
import { notWired } from '../../wiring';
import type { PgDocs } from '../docs';
import type { PgTx } from '../uow';
import { pgGraphData, pgGraphTx } from './graph';
import { pgSocialData, pgSocialTx } from './social';
import { pgTapsData, pgTapsTx } from './taps';

/**
 * The aggregates PostgreSQL implements so far, each held to its contract
 * (src/server/contract/<agg>.contract.ts, run by the `*.pg.test.ts` suites):
 * taps, social, graph, and `users.hasBlocked` / `users.rowsOf`. Every other aggregate is
 * `notWired`: calling it throws NotWiredError naming the aggregate —
 * docs/ops/postgres.md lists what Phase 4 still needs.
 */
export const PG_AGGREGATES = ['taps', 'social', 'graph'] as const;

const pending = <T extends object>(agg: string) => notWired<T>(`postgres.${agg}`, `the ${agg} aggregate has no PostgreSQL repository yet (docs/ops/postgres.md)`);

/** `users` outside a transaction: only what the other aggregates and the shadowed reads need (a block, people's rows). */
function pgUsersData(docs: PgDocs): DataRepos['users'] {
  const rest = pending<DataRepos['users']>('users');
  return new Proxy(rest, {
    get(target, prop) {
      if (prop === 'hasBlocked') return async (uid: string, other: string) => (await docs.get('blocks', `${uid}/${other}`)) != null;
      if (prop === 'rowsOf') {
        return async (ids: string[], fields: readonly string[]) => {
          const wanted = [...new Set(ids)].filter(docIdOk);
          const found = wanted.length ? await docs.rows('users', { in: { id: wanted } }) : [];
          return new Map(found.map(({ id, row }) => [id, Object.fromEntries(fields.filter((f) => row[f] !== undefined).map((f) => [f, row[f]]))]));
        };
      }
      return Reflect.get(target, prop);
    },
  });
}

export function buildPgTxRepos(tx: PgTx): TxRepos {
  return {
    taps: pgTapsTx(tx),
    social: pgSocialTx(tx),
    graph: pgGraphTx(tx),
    pushState: pending('pushState'),
    bell: pending('bell'),
    cards: pending('cards'),
    users: pending('users'),
    conversations: pending('conversations'),
    recommend: pending('recommend'),
    account: pending('account'),
    infra: pending('infra'),
    translations: pending('translations'),
    writer: pending('writer'),
  };
}

export function buildPgDataRepos(docs: PgDocs): DataRepos {
  return {
    taps: pgTapsData(docs),
    social: pgSocialData(docs),
    graph: pgGraphData(docs),
    users: pgUsersData(docs),
    pushState: pending('pushState'),
    bell: pending('bell'),
    cards: pending('cards'),
    conversations: pending('conversations'),
    recommend: pending('recommend'),
    account: pending('account'),
    infra: pending('infra'),
    translations: pending('translations'),
    writer: pending('writer'),
  };
}
