/**
 * The chat's times, one way wherever they show — the conversation list, the
 * thread's labels, a message's menu and tooltip, a search's results: the
 * hour without a leading zero (「下午6:29」, "6:29 PM"), as the locale writes
 * it. One formatter per locale and kind, made on first use.
 */
const TIME_OF_DAY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const made = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, kind: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${kind}|${locale}`;
  let f = made.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    made.set(key, f);
  }
  return f;
}

/** A time of day: 「下午6:29」. */
export function timeOfDay(locale: string): Intl.DateTimeFormat {
  return formatter(locale, 'time', TIME_OF_DAY);
}

/** A message's full time — its day and its time of day in the same words: 「10月27日 下午6:29」. */
export function fullMessageTime(locale: string): Intl.DateTimeFormat {
  return formatter(locale, 'full', { month: 'long', day: 'numeric', ...TIME_OF_DAY });
}
