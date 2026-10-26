import { describe, expect, it } from 'vitest';
import { inertJson, terminalSafe } from '../../../scripts/moderation/terminal';

// The moderation queue prints what reporters and reported people wrote to the
// operator's terminal: an ESC there would start a control sequence.
describe('terminalSafe (moderation output)', () => {
  it('shows control characters and bidi overrides as escapes, keeping the words', () => {
    expect(terminalSafe('hi\u001b]0;owned\u0007 there')).toBe('hi\\u001b]0;owned\\u0007 there');
    expect(terminalSafe('a‮b\nc')).toBe('a\\u202eb c');
    expect(terminalSafe('雨天 🌧')).toBe('雨天 🌧');
    expect(terminalSafe(undefined)).toBe('');
  });

  it('escapes C1 controls, zero-width and format characters and the separators too', () => {
    expect(terminalSafe('x\u009b2Jy\u200bz\u2028w')).toBe('x\\u009b2Jy\\u200bz\\u2028w');
  });
});

// `show` prints JSON: JSON.stringify escapes C0 only, so the rest is escaped after it.
describe('inertJson (moderation show)', () => {
  it('leaves no raw C1, DEL or format character, and the JSON reads back the same', () => {
    const stored = { detail: 'a\u009bb\u007fc\u202ed\u2029e\u001bf', id: 'R1\u009dR2' };
    const out = inertJson(JSON.stringify(stored, null, 2));
    expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}\u2028\u2029]/u);
    expect(JSON.parse(out)).toEqual(stored);
  });
});
