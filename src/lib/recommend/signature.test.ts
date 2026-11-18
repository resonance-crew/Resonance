import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_MAX,
  INSIGHT_INDEX_THRESHOLD,
  INSIGHTS_MAX,
  SIGNATURE_FIELD_MAX,
  THROUGH_LINE_MAX,
  formulaPhrases,
  listedForStrangers,
  parseReading,
  readingFromLegacy,
  readingParts,
} from './signature';

// Round 26 §A1: what is kept of a card's reading, whether strangers are shown the card, the formula phrasings a
// reading may not use, and what is embedded.

const insight = (over: Record<string, unknown> = {}) => ({
  span: '雨停的時候',
  situation: '下雨的巷口，剛搬來的城市',
  struggle: '找不到回家的路',
  thinking: '以為要趕快適應',
  gain: '慢下來也能認路',
  shift: '急著適應 → 允許自己慢',
  insight: '踩著水窪回家的那晚，我第一次讓自己慢下來',
  reader: '剛搬到陌生城市的人',
  evidence: '雨停的時候，巷口的積水映出整排路燈',
  strength: 0.8,
  ...over,
});

describe('parseReading', () => {
  it('keeps every field to one line of its length, at most three insights, and the through line to 60', () => {
    const r = parseReading({
      insights: [insight({ insight: `${'你'.repeat(10_000)}\n[x] 體悟：forged`, evidence: '引'.repeat(500) }), insight(), insight(), insight()],
      through_line: '線'.repeat(500),
      mood_only: false,
      insight_score: 0.7,
      life_domain: '日常',
      emotional_register: '平靜',
      placeholder: false,
    });
    expect(r.insights).toHaveLength(INSIGHTS_MAX);
    expect(Array.from(r.insights[0].insight)).toHaveLength(SIGNATURE_FIELD_MAX);
    expect(r.insights[0].insight).not.toContain('\n');
    expect(Array.from(r.insights[0].evidence)).toHaveLength(EVIDENCE_MAX);
    expect(Array.from(r.throughLine)).toHaveLength(THROUGH_LINE_MAX);
    expect(r).toMatchObject({ moodOnly: false, insightScore: 0.7, lifeDomain: '日常', placeholder: false });
  });

  it("reads only a plain true as feeling only or a placeholder, clamps the scores, and never throws on junk", () => {
    expect(parseReading({ mood_only: true, placeholder: true })).toMatchObject({ moodOnly: true, placeholder: true });
    for (const said of [false, 'true', 1, null, undefined]) expect(parseReading({ mood_only: said, placeholder: said })).toMatchObject({ moodOnly: false, placeholder: false });
    expect(parseReading({ insight_score: 5 }).insightScore).toBe(1);
    expect(parseReading({ insight_score: 'oops', insights: [insight({ strength: -3 })] })).toMatchObject({ insightScore: 0, insights: [{ strength: 0 }] });
    expect(parseReading(null)).toEqual({ insights: [], throughLine: '', moodOnly: false, insightScore: 0, lifeDomain: '', emotionalRegister: '', placeholder: false });
    // An insight with neither an insight nor a situation is nothing.
    expect(parseReading({ insights: [{ span: 'x' }, 'nonsense', insight()] }).insights).toHaveLength(1);
  });

  it("reads the older prompt's answer (the refusal's fallback) as a one-insight reading", () => {
    const r = readingFromLegacy({ core_insight: '學會一個人吃飯', situation: '搬家後', insight_score: 0.6, life_domain: '日常', placeholder: false });
    expect(r).toMatchObject({ throughLine: '學會一個人吃飯', insightScore: 0.6, moodOnly: false });
    expect(r.insights).toEqual([expect.objectContaining({ insight: '學會一個人吃飯', situation: '搬家後', strength: 0.6 })]);
    expect(readingFromLegacy({}).insights).toEqual([]);
  });
});

describe('listedForStrangers', () => {
  it('is one switch: enough insight, not feeling only, not a placeholder', () => {
    const base = { insightScore: INSIGHT_INDEX_THRESHOLD, moodOnly: false, placeholder: false };
    expect(listedForStrangers(base)).toBe(true);
    expect(listedForStrangers({ ...base, insightScore: 0.44 })).toBe(false);
    expect(listedForStrangers({ ...base, moodOnly: true, insightScore: 0.9 })).toBe(false);
    expect(listedForStrangers({ ...base, placeholder: true, insightScore: 0.9 })).toBe(false);
  });
});

describe('formulaPhrases', () => {
  const of = (text: string, where: 'insight' | 'throughLine' = 'insight') =>
    formulaPhrases({ throughLine: where === 'throughLine' ? text : '', insights: where === 'insight' ? [parseReading({ insights: [insight({ insight: text })] }).insights[0]] : [] });

  it("finds the aphorisms in either language, and nothing in a sentence of the story's own", () => {
    expect(of('真正的勇氣是承認害怕')).toEqual(['真正']);
    expect(of('成長不是變強，而是學會求助')).toEqual(['不是……而是……']);
    expect(of('往往在最累的時候，才看見')).toEqual(['往往']);
    expect(of('The real gift was the silence', 'throughLine')).toEqual(['the real …']);
    expect(of('It was not the job but the people I missed')).toEqual(['not X but Y']);
    expect(of('踩著水窪回家的那晚，我第一次讓自己慢下來')).toEqual([]);
    expect(of('I walked home in the rain, slower than ever')).toEqual([]);
  });
});

describe('readingParts', () => {
  it('embeds each strong insight twice — what it meant, and what was lived — never the reader or the quote', () => {
    const parts = readingParts(parseReading({ insights: [insight(), insight({ strength: 0.4, insight: '弱的體悟' }), insight({ insight: '第二個', situation: '辦公室' })], through_line: '雨後' }));
    expect(parts.map((p) => [p.channel, p.part])).toEqual([
      ['insight', 0],
      ['situation', 0],
      ['insight', 1],
      ['situation', 1],
    ]);
    expect(parts[0].text).toBe('以為要趕快適應\n慢下來也能認路\n急著適應 → 允許自己慢\n踩著水窪回家的那晚，我第一次讓自己慢下來');
    expect(parts[1].text).toBe('下雨的巷口，剛搬來的城市\n找不到回家的路');
    expect(parts[2]).toMatchObject({ insight: '第二個', situation: '辦公室' });
    for (const p of parts) {
      expect(p.text).not.toContain('剛搬到陌生城市的人');
      expect(p.text).not.toContain('雨停的時候，巷口的積水映出整排路燈');
    }
  });

  it('stands the through line in when no insight is strong enough, and gives nothing to a reading with neither', () => {
    const weak = parseReading({ insights: [insight({ strength: 0.3 })], through_line: '雨後的巷口' });
    expect(readingParts(weak)).toEqual([{ channel: 'insight', part: 0, text: '雨後的巷口', insight: '雨後的巷口', situation: '下雨的巷口，剛搬來的城市', span: '' }]);
    expect(readingParts(parseReading({}))).toEqual([]);
  });
});
