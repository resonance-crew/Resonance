import type { DataRepos, TxRepos } from '@/server/ports/uow';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';
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
import { writerData, writerTx } from './writer';

// Lanes fill their own aggregate's file; this one only lists them.

export function buildMemoryTxRepos(tx: MemoryTx): TxRepos {
  return {
    pushState: pushStateTx(tx),
    taps: tapsTx(tx),
    bell: bellTx(tx),
    cards: cardsTx(tx),
    users: usersTx(tx),
    graph: graphTx(tx),
    conversations: conversationsTx(tx),
    recommend: recommendTx(tx),
    account: accountTx(tx),
    infra: infraTx(tx),
    translations: translationsTx(tx),
    writer: writerTx(tx),
  };
}

export function buildMemoryDataRepos(state: MemoryState): DataRepos {
  return {
    pushState: pushStateData(state),
    taps: tapsData(state),
    bell: bellData(state),
    cards: cardsData(state),
    users: usersData(state),
    graph: graphData(state),
    conversations: conversationsData(state),
    recommend: recommendData(state),
    account: accountData(state),
    infra: infraData(state),
    translations: translationsData(state),
    writer: writerData(state),
  };
}
