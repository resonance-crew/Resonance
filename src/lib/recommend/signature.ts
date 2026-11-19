import type { CardReading, ReadingInsight } from '@/lib/db/types';
import type { VectorChannel } from './vectorStore/types';

/**
 * The pure rules of a card's reading (round 26 §A1): what is kept of the
 * model's answer, whether a card is listed for strangers, which formula
 * phrasings a reading may not use, and what is embedded. No I/O.
 */

/**
 * The least insight score for a card to be put before strangers (with
 * `!moodOnly && !placeholder`: {@link listedForStrangers}, one switch).
 * Re-calibrated on the exam after the first bake-off (§E1).
 */
export const INSIGHT_INDEX_THRESHOLD = 0.45;

/**
 * The longest a reading's field is kept, in code points. The fields are model
 * output about an author's card, and the hit part's insight and situation go
 * into other readers' ranking prompts: one line each, never a page a card
 * could talk the model into writing (or extra lines in the prompt's list).
 */
export const SIGNATURE_FIELD_MAX = 200;
/** The through line (the card's `coreInsight`), in code points. */
export const THROUGH_LINE_MAX = 60;
/** A quoted piece of the story, in code points. */
export const EVIDENCE_MAX = 40;
/** At most this many insights a card (C4: more parts, more chances to be near everything). */
export const INSIGHTS_MAX = 3;
/**
 * A story shorter than this — CJK characters and other words together
 * (`measure`, as the mirror counts a draft) — is read into one insight (§A1.4:
 * "1 insight for a short card"), one shorter than {@link LONG_STORY_UNITS}
 * into at most two, a longer one into {@link INSIGHTS_MAX}. Set on the first
 * bake-off (2026-11-19): left to choose, the model gave stories of 800–1 400
 * characters two or three insights, thinner and nearer each other.
 */
export const SHORT_STORY_UNITS = 1_500;
export const LONG_STORY_UNITS = 4_000;

/** How many insights a story this long is read into, at most. */
export function insightsFor(units: number): number {
  if (units < SHORT_STORY_UNITS) return 1;
  if (units < LONG_STORY_UNITS) return 2;
  return INSIGHTS_MAX;
}
/** A part weaker than this gets no vector (D11: the through line stands in when none clears it). */
export const PART_MIN_STRENGTH = 0.5;

/** One line, at most `max` code points. */
export function line(value: unknown, max = SIGNATURE_FIELD_MAX): string {
  if (typeof value !== 'string') return '';
  const one = value.replace(/\s+/g, ' ').trim();
  return Array.from(one).slice(0, max).join('');
}

/**
 * A line shown as one sentence ends without a full stop (CLAUDE.md, Copy):
 * the through line is shown to the author as their card's core insight. A
 * question or an exclamation keeps its mark.
 */
export function unstopped(text: string): string {
  return text.replace(/[。．.]+$/u, '').trimEnd();
}

/** Clamp an arbitrary value into a 0–1 score, defaulting to 0. */
function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseInsight(raw: unknown): ReadingInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const insight: ReadingInsight = {
    span: line(r.span),
    situation: line(r.situation),
    struggle: line(r.struggle),
    thinking: line(r.thinking),
    gain: line(r.gain),
    shift: line(r.shift),
    insight: line(r.insight),
    reader: line(r.reader),
    evidence: line(r.evidence, EVIDENCE_MAX),
    strength: clamp01(r.strength),
  };
  return insight.insight || insight.situation ? insight : null;
}

/**
 * Coerce the model's JSON (snake_case, possibly partial — Structured Outputs
 * holds the shape, not the lengths) into a well-formed {@link CardReading}.
 * Tolerant of anything missing, so a sloppy answer never throws: a reading
 * with nothing in it is simply not listed. More insights than `max` (the
 * story's {@link insightsFor}) keep the strongest, in the story's order.
 */
export function parseReading(raw: unknown, max = INSIGHTS_MAX): CardReading {
  const r = (raw ?? {}) as Record<string, unknown>;
  const all = (Array.isArray(r.insights) ? r.insights : []).map(parseInsight).filter((i): i is ReadingInsight => i !== null);
  const cap = Math.max(1, Math.min(INSIGHTS_MAX, Math.floor(max)));
  const insights =
    all.length <= cap
      ? all
      : all
          .map((insight, at) => ({ insight, at }))
          .sort((a, b) => b.insight.strength - a.insight.strength || a.at - b.at)
          .slice(0, cap)
          .sort((a, b) => a.at - b.at)
          .map(({ insight }) => insight);
  return {
    insights,
    throughLine: unstopped(line(r.through_line ?? r.throughLine, THROUGH_LINE_MAX)),
    // Only a plain `true` takes a card out: anything else the model says reads as false.
    moodOnly: (r.mood_only ?? r.moodOnly) === true,
    insightScore: clamp01(r.insight_score ?? r.insightScore),
    lifeDomain: line(r.life_domain ?? r.lifeDomain),
    emotionalRegister: line(r.emotional_register ?? r.emotionalRegister),
    placeholder: r.placeholder === true,
  };
}

/**
 * The answer of the older prompt (the refusal's fallback, on `llmModel()`):
 * one realization and its circumstance, read as a one-insight reading.
 */
export function readingFromLegacy(raw: unknown): CardReading {
  const r = (raw ?? {}) as Record<string, unknown>;
  const core = line(r.core_insight ?? r.coreInsight);
  const score = clamp01(r.insight_score ?? r.insightScore);
  return {
    insights: core
      ? [{ span: '', situation: line(r.situation), struggle: '', thinking: '', gain: '', shift: '', insight: core, reader: '', evidence: '', strength: score }]
      : [],
    throughLine: unstopped(line(core, THROUGH_LINE_MAX)),
    moodOnly: false,
    insightScore: score,
    lifeDomain: line(r.life_domain ?? r.lifeDomain),
    emotionalRegister: line(r.emotional_register ?? r.emotionalRegister),
    placeholder: r.placeholder === true,
  };
}

/**
 * Whether strangers may be shown the card (§A1.7) — one switch every path
 * that picks cards for people who aren't its author's connections reads: the
 * recommendation pool (an unlisted card gets no vectors), cold start, the
 * card page's related cards, the landing film, the evening push. A card not
 * listed is still published, in the feed and on its author's profile.
 */
export function listedForStrangers(reading: Pick<CardReading, 'insightScore' | 'moodOnly' | 'placeholder'>): boolean {
  return reading.insightScore >= INSIGHT_INDEX_THRESHOLD && !reading.moodOnly && !reading.placeholder;
}

/**
 * The formula phrasings a reading may not use (§A1.5): aphorisms that make
 * every card sound alike and stand near each other for it. The prompt asks
 * the model to check for them; this checks after it.
 */
const FORMULAS: { name: string; pattern: RegExp }[] = [
  { name: '真正', pattern: /真正/ },
  { name: '不是……而是……', pattern: /不是[^。！？!?]{0,40}?而是/ },
  { name: '往往', pattern: /(?:^|[。！？!?；;，,]\s*)往往/ },
  { name: 'the real …', pattern: /\bthe real\b/i },
  { name: 'not X but Y', pattern: /\bnot\b[^.!?;]{1,60}?\bbut\b/i },
];

/** Letters and digits only, lower-cased: a title and a line compared without their spaces and punctuation. */
const bare = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Whether a through line only says the card's title again (§A1.4): the same
 * words, a piece of the title, or the title with little added (it is at least
 * 60% of the line). The through line is shown to the author, who wrote the
 * title: one that repeats it tells them nothing.
 */
export function restatesTitle(throughLine: string, title: string): boolean {
  const said = bare(throughLine);
  const head = bare(title);
  if (!said || !head) return false;
  if (head.includes(said)) return true;
  return said.includes(head) && head.length >= 0.6 * said.length;
}

/** How {@link formulaPhrases} names a through line that repeats the title (and the second ask reads it). */
export const TITLE_ECHO = 'through_line = the title';

/**
 * The formula phrasings found in a reading's insight-bearing text (empty:
 * none), and, given the card's title, a through line that only repeats it
 * ({@link TITLE_ECHO}): both are asked once more by the cron and the backfill.
 */
export function formulaPhrases(reading: Pick<CardReading, 'insights' | 'throughLine'>, title?: string): string[] {
  const texts = [reading.throughLine, ...reading.insights.flatMap((i) => [i.insight, i.thinking, i.gain, i.shift])].filter(Boolean);
  const found = FORMULAS.filter((f) => texts.some((t) => f.pattern.test(t))).map((f) => f.name);
  if (title !== undefined && restatesTitle(reading.throughLine, title)) found.push(TITLE_ECHO);
  return found;
}

/** One part of a card as the vector index keeps it: what is embedded, and the short lines a hit shows other readers' prompts. */
export interface ReadingPart {
  channel: VectorChannel;
  /** Which insight it comes from (0-based; the through line's stand-in is 0). */
  part: number;
  /** What is embedded. */
  text: string;
  /** The hit's one-line insight and situation (≤ SIGNATURE_FIELD_MAX each): what the rerank and select prompts read. */
  insight: string;
  situation: string;
  /** Where in the story it is. */
  span: string;
}

/**
 * The parts a card is embedded as (§A2.1): for each insight of strength
 * ≥ PART_MIN_STRENGTH (three at most), an `insight` passage (thinking, gain,
 * shift and the insight) and a `situation` one (the circumstance and what was
 * hard). A card none of whose insights clears that gets one `insight` part
 * from its through line. `reader` and `evidence` are never embedded.
 */
export function readingParts(reading: CardReading): ReadingPart[] {
  const strong = reading.insights.slice(0, INSIGHTS_MAX).filter((i) => i.strength >= PART_MIN_STRENGTH);
  if (strong.length === 0) {
    if (!reading.throughLine) return [];
    const best = [...reading.insights].sort((a, b) => b.strength - a.strength)[0];
    return [{ channel: 'insight', part: 0, text: reading.throughLine, insight: reading.throughLine, situation: best?.situation ?? '', span: '' }];
  }
  return strong.flatMap((i, part) => {
    const shared = { part, insight: i.insight || reading.throughLine, situation: i.situation, span: i.span };
    const insightText = [i.thinking, i.gain, i.shift, i.insight].filter(Boolean).join('\n');
    const situationText = [i.situation, i.struggle].filter(Boolean).join('\n');
    return [
      ...(insightText ? [{ channel: 'insight' as const, text: insightText, ...shared }] : []),
      ...(situationText ? [{ channel: 'situation' as const, text: situationText, ...shared }] : []),
    ];
  });
}
