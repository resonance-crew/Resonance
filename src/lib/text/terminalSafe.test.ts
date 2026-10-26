import { describe, expect, it } from 'vitest';
import { terminalSafe } from '../../../scripts/moderation/terminal';

// The moderation queue prints what reporters and reported people wrote to the
// operator's terminal: an ESC there would start a control sequence.
describe('terminalSafe (moderation output)', () => {
  it('shows control characters and bidi overrides as escapes, keeping the words', () => {
    expect(terminalSafe('hi\u001b]0;owned\u0007 there')).toBe('hi\\u001b]0;owned\\u0007 there');
    expect(terminalSafe('a‮b\nc')).toBe('a\\u202eb c');
    expect(terminalSafe('雨天 🌧')).toBe('雨天 🌧');
    expect(terminalSafe(undefined)).toBe('');
  });
});
