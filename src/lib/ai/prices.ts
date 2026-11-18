import type { TokenUsage } from './openai';

/**
 * What OpenAI charges, US dollars per million tokens (input, output; an
 * embedding model has input only), as of 2026-11-18 — for the cost lines the
 * daily index cron, the backfill and the dry run print. A model not listed
 * prints no cost. Never used to decide anything.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-6.2-astra': { input: 8, output: 40 },
  'gpt-6.2-sol': { input: 2, output: 10 },
  'gpt-6.1-terra': { input: 1, output: 5 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

/** Dollars for `usage` on `model` (reasoning is billed as output, and counted in it), or null for a model without a price here. */
export function costOf(model: string, usage: Pick<TokenUsage, 'input' | 'output'>): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (usage.input * price.input + usage.output * price.output) / 1_000_000;
}

/** A cost line: "$0.0123", or "?" without a price. */
export const dollars = (cost: number | null) => (cost === null ? '?' : `$${cost.toFixed(4)}`);
