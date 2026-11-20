import type { Transaction } from 'firebase-admin/firestore';
import type { DataRepos, TxRepos } from '@/server/ports/uow';
import type { AdminDb } from '../db';
import { accountData, accountTx } from './account';
import { bellData, bellTx } from './bell';
import { cardsData, cardsTx } from './cards';
import { conversationsData, conversationsTx } from './conversations';
import { graphData, graphTx } from './graph';
import { infraData, infraTx } from './infra';
import { pushStateData, pushStateTx } from './pushState';
import { recommendData, recommendTx } from './recommend';
import { tapsData, tapsTx } from './taps';
import { translationsData, translationsTx } from './translations';
import { usersData, usersTx } from './users';

// Lanes fill their own aggregate's file; this one only lists them.

export function buildTxRepos(db: AdminDb, tx: Transaction): TxRepos {
  return {
    pushState: pushStateTx(db, tx),
    taps: tapsTx(db, tx),
    bell: bellTx(db, tx),
    cards: cardsTx(db, tx),
    users: usersTx(db, tx),
    graph: graphTx(db, tx),
    conversations: conversationsTx(db, tx),
    recommend: recommendTx(db, tx),
    account: accountTx(db, tx),
    infra: infraTx(db, tx),
    translations: translationsTx(db, tx),
  };
}

export function buildDataRepos(db: AdminDb): DataRepos {
  return {
    pushState: pushStateData(db),
    taps: tapsData(db),
    bell: bellData(db),
    cards: cardsData(db),
    users: usersData(db),
    graph: graphData(db),
    conversations: conversationsData(db),
    recommend: recommendData(db),
    account: accountData(db),
    infra: infraData(db),
    translations: translationsData(db),
  };
}
