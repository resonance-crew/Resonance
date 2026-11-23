/**
 * A write's budget (rateLimit `spend`), started beside the write's reads rather than before them, so the two overlap
 * (B7, BE-7): every attempt spends it, and it still answers first — the write awaits `spent` after its reads and
 * before anything is written, and any refusal waits for it too, so over budget the answer is the 429 whatever else is
 * wrong with the request, exactly as when the budget was spent first. See src/lib/api/v1/conversations.ts.
 */
export async function budgetFirst<T>(spent: Promise<void>, send: () => Promise<T>): Promise<T> {
  // Handled from the start: refused while the send's reads run, it is awaited below all the same.
  spent.catch(() => {});
  let result: T;
  try {
    result = await send();
  } catch (e) {
    await spent;
    throw e;
  }
  await spent;
  return result;
}
