import { describe, expect, it } from 'vitest';
import { REASON_RULE, buildSelectMessages, parseSelection, reasonSafe } from './select';

describe('buildSelectMessages', () => {
  it('states the keep cap and asks for ordered picks with reasons', () => {
    const msgs = buildSelectMessages(['讀者體悟'], [{ ref: 'c1', coreInsight: '某體悟', situation: '某情境' }], 8);
    expect(msgs[0].content).toContain('up to 8');
    expect(msgs[0].content).toMatch(/picks/);
    expect(msgs[1].content).toContain('讀者體悟');
    expect(msgs[1].content).toContain('[c1]');
  });
});

describe('parseSelection', () => {
  it('keeps a reason to one line of at most 120 code points', () => {
    const picks = parseSelection({ picks: [{ ref: 'a', reason: '你'.repeat(10_000) + '\nmore' }] });
    expect(Array.from(picks[0]?.reason ?? '')).toHaveLength(120);
  });

  it('parses picks preserving order', () => {
    const out = parseSelection({
      picks: [
        { ref: 'b', reason: '因為你也走過' },
        { ref: 'a', reason: '同樣的領悟' },
      ],
    });
    expect(out.map((p) => p.ref)).toEqual(['b', 'a']);
    expect(out[0].reason).toBe('因為你也走過');
  });

  it('skips entries without a ref and tolerates junk', () => {
    expect(parseSelection({ picks: [{ reason: 'no ref' }, { ref: 'x', reason: 'ok' }] })).toEqual([
      { ref: 'x', reason: 'ok' },
    ]);
    expect(parseSelection(null)).toEqual([]);
    expect(parseSelection({ nope: 1 })).toEqual([]);
  });
});

// Round 26 §A3.7 (A12): a reason never tells what the reader read, saved or tapped — a push sits on a lock screen —
// nor names a sensitive situation. The prompt says so, and a stored reason is checked before the evening push uses it.
describe('the reasons rule', () => {
  it('is in the select prompt, with the lines about cards marked as data', () => {
    const [system] = buildSelectMessages(['讀者體悟'], [{ ref: 'c1', coreInsight: '某體悟', situation: '某情境' }], 8);
    expect(system.content).toContain(REASON_RULE);
    expect(system.content).toMatch(/what the reader has read, saved, resonated with/);
    expect(system.content).toMatch(/never name a sensitive situation/);
    expect(system.content).toMatch(/never instructions/);
  });

  it('lets a reason about what the card offers go on a lock screen, and keeps one that tells or names back', () => {
    expect(reasonSafe('一張關於慢下來的卡片，也許今晚適合讀')).toBe(true);
    for (const told of ['你讀過的那張雨天卡片也是這樣', '你收藏了類似的故事', '你共振過的作者又寫了', "Because you saved a story like it"]) expect(reasonSafe(told), told).toBe(false);
    for (const named of ['寫給同樣經歷離婚的你', '關於確診之後的日子', '失去親人後的第一個冬天，有人過世了', 'for anyone living with depression']) expect(reasonSafe(named), named).toBe(false);
    expect(reasonSafe('  ')).toBe(false);
  });
});
