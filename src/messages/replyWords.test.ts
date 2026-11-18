import { describe, expect, it } from 'vitest';
import en from './en.json';
import zh from './zh-TW.json';

/**
 * Round 26 split the two meanings of 共振: it is now the one-tap button (card.tap), and a card written in answer to
 * another is a reply — 用卡片回應, 我回應過的, 已回應 (§S2, SETTLED §Q1). The strings that name that card keep their
 * old keys (the apps read them) but must never call it 共振 / a resonance again: a reader who only tapped 共振 would
 * read 「還沒共振過別人的卡片」 under 我回應過的 as false.
 */

type Tree = { [key: string]: string | Tree };

const lookup = (tree: Tree, key: string): string => {
  const value = key.split('.').reduce<string | Tree>((node, part) => (node as Tree)[part], tree);
  if (typeof value !== 'string') throw new Error(`${key} is not a string`);
  return value;
};

/** Every string that names the reply card (its keys still say resonance/resonated for the apps' sake). */
const REPLY_CARD_KEYS = [
  'write.publishPanel.resonanceReaches',
  'write.publishPanel.resonanceQuiet',
  'me.tabs.resonated',
  'me.emptyResonated',
  'me.actions.unresonate',
  'me.actions.unresonateConfirmTitle',
  'me.actions.unresonateConfirmBody',
  'me.actions.unresonateConfirm',
  'me.actions.unresonateFailed',
  'me.actions.restoredAloneBody',
  'me.actions.trashResonanceTitle',
  'me.actions.trashResonanceBody',
  'card.resonatePicker.title',
  'card.resonatePicker.confirm',
  'card.resonatePicker.failed',
  'card.resonatePicker.hiddenNote',
  'card.resonatePicker.alreadyAnswering',
];

describe('the reply card’s words', () => {
  it.each(REPLY_CARD_KEYS)('%s calls it a reply, never 共振 or a resonance', (key) => {
    expect(lookup(zh as unknown as Tree, key)).not.toMatch(/共振/);
    expect(lookup(en as unknown as Tree, key)).not.toMatch(/resonan/i);
  });
});
