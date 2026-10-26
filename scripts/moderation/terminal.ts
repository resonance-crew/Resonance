/**
 * What reporters and reported people wrote, safe to print to the operator's
 * terminal: control characters (an ESC starts a sequence that can rewrite
 * the screen, the window title or the clipboard) and bidi overrides shown as
 * escapes, never acted on. `show` prints JSON, which escapes them already.
 */
export function terminalSafe(v: unknown): string {
  return String(v ?? '').replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, (c) =>
    c === '\n' ? ' ' : `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );
}
