// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { keepLocalPicture, localPicture, LOCAL_PICTURES_MAX } from './localPictures';

// W17: the pictures sent from this page are drawn from the device — the newest of them; an older one lets its
// blob go and is drawn from the server's copy.
describe('localPictures', () => {
  it('keeps the newest pictures sent from here, letting the oldest go', () => {
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['x'], { type: 'image/webp' });
    const first = keepLocalPicture('p0', blob);
    expect(keepLocalPicture('p0', blob)).toBe(first);
    for (let i = 1; i <= LOCAL_PICTURES_MAX; i++) keepLocalPicture(`p${i}`, blob);
    expect(localPicture('p0')).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(localPicture(`p${LOCAL_PICTURES_MAX}`)).toBe(`blob:${LOCAL_PICTURES_MAX + 1}`);
    expect(localPicture('p1')).toBe('blob:2');
  });
});
