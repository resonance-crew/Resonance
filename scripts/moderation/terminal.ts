/**
 * What reporters and reported people wrote — and the ids an older app build
 * chose for its reports — safe to print to the operator's terminal: control
 * characters (an ESC or a C1 CSI starts a sequence that can rewrite the
 * screen, the window title or the clipboard), format characters (bidi
 * overrides, zero-width ones) and line/paragraph separators shown as escapes,
 * never acted on; a line feed becomes a space, so no line can be forged.
 */
export function terminalSafe(v: unknown): string {
  return String(v ?? '').replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (c) => (c === '\n' ? ' ' : escapeUnits(c)));
}

/**
 * JSON text made inert the same way (`show`): JSON.stringify escapes the C0
 * controls only, leaving DEL, the C1 controls (U+0080–U+009F: CSI, OSC…),
 * format characters and the separators raw. Escaped here as \uXXXX — still
 * valid JSON, since such characters can only stand inside its strings.
 */
export function inertJson(json: string): string {
  return json.replace(/[\u007f-\u009f\p{Cf}\u2028\u2029]/gu, escapeUnits);
}

/** A character as JSON-style \uXXXX escapes, one per UTF-16 unit. */
function escapeUnits(c: string): string {
  let out = '';
  for (let i = 0; i < c.length; i++) out += `\\u${c.charCodeAt(i).toString(16).padStart(4, '0')}`;
  return out;
}
