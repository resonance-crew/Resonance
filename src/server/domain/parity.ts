import { createHash } from 'node:crypto';

/**
 * The shadow reads' comparison (plan section 4.4, layer 3): two answers to
 * the same request, normalised, and where they differ — as field paths
 * only. A log line made of these never holds a value, and never an id: a
 * path's array positions are `[n]`, a key that is a schema field (a short
 * camelCase word) stays, any other key (a uid or a pair id used as a map
 * key) is replaced by its hash. So an anonymous card's author never reaches
 * a log, even when the two backends disagree exactly about that author.
 */

/** sha256 hex, the first `n` characters. */
export function hashPrefix(value: string, n = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, n);
}

/** A schema field name, safe to log as it is; anything else is hashed. */
const FIELD = /^[a-z][a-zA-Z]{0,31}$/;

const segment = (key: string) => (FIELD.test(key) ? key : `#${hashPrefix(key, 8)}`);

/** JSON's view of a value (Dates as ISO strings, undefined dropped), keys in order. */
export function normalise(value: unknown): unknown {
  const json = value === undefined ? null : JSON.parse(JSON.stringify(value));
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  return sort(json);
}

/** The paths at which two normalised answers differ (at most `max`). */
export function differences(a: unknown, b: unknown, max = 20): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, path: string) => {
    if (out.length >= max) return;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) out.push(`${path || '$'}.length`);
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`);
      return;
    }
    const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(x) && isObj(y)) {
      const xo = x as Record<string, unknown>;
      const yo = y as Record<string, unknown>;
      for (const k of [...new Set([...Object.keys(xo), ...Object.keys(yo)])].sort()) walk(xo[k], yo[k], path ? `${path}.${segment(k)}` : segment(k));
      return;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(path || '$');
  };
  walk(normalise(a), normalise(b), '');
  return out;
}

/** The one line a difference logs: `[parity] <route> <paths> <hash of the key>`. */
export function parityLine(route: string, paths: readonly string[], key: string): string {
  return `[parity] ${route} ${paths.join(',')} ${hashPrefix(key)}`;
}
