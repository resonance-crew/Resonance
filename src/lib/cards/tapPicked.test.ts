import { describe, expect, it } from 'vitest';
import { offlinePassages, passageId, verifyPassages } from './tapPassages';
import { PICKED_CANDIDATES, PICKED_FACES_MAX, pickedFaces, pickedIn, type PickingTapper } from './tapPicked';

// The author's picked sentences (round 29 §P1): which stored picks are
// sentences of the story as it is now, in the story's order, each with its
// pickers newest first — and the faces one sentence shows once its
// candidates' blocks and profiles are read.

const P1 = '那年我搬到台北，一個人住在頂樓加蓋的小房間。夏天熱得睡不著，我常常坐在樓梯間吹風。';
const P2 = '最難的是第一個冬天，工作做不好，也不敢打電話回家。每天下班都繞遠路走回去。';
const P3 = '後來我學會了煮一鍋湯，分給隔壁的室友，原來一個人的城市，也可以慢慢長出一個家的樣子。';
const STORY = [P1, `> ${P2}`, P3].join('\n\n');

const pick = (text: string) => ({ id: passageId(text), text });
const tap = (uid: string, at: number, text: string | null): PickingTapper => ({ uid, at, passage: text == null ? null : pick(text) });

const A = '那年我搬到台北，一個人住在頂樓加蓋的小房間。';
const B = '夏天熱得睡不著，我常常坐在樓梯間吹風。';
const C = '每天下班都繞遠路走回去。';
const D = '後來我學會了煮一鍋湯，分給隔壁的室友，';

describe('pickedIn', () => {
  it("answers the picked sentences in the story's order, whatever order the taps came in, each with its pickers newest first", () => {
    const got = pickedIn(STORY, [tap('u1', 50, D), tap('u2', 40, C), tap('u3', 30, A), tap('u4', 60, C), tap('u5', 10, null)]);
    expect(got.map((s) => s.text)).toEqual([A, C, D]);
    expect(got.map((s) => s.id)).toEqual([pick(A).id, pick(C).id, pick(D).id]);
    expect(got.map((s) => s.block)).toEqual([0, 1, 2]);
    expect(got[1].pickers.map((p) => p.uid)).toEqual(['u4', 'u2']);
    // Nobody picked: nothing.
    expect(pickedIn(STORY, [tap('u5', 10, null)])).toEqual([]);
    expect(pickedIn('', [tap('u1', 1, A)])).toEqual([]);
  });

  it('puts two sentences of one block by where each starts', () => {
    const got = pickedIn(STORY, [tap('u1', 2, B), tap('u2', 1, A)]);
    expect(got.map((s) => [s.text, s.block])).toEqual([[A, 0], [B, 0]]);
    expect(got[0].start).toBe(0);
    expect(got[1].start).toBe(A.length);
  });

  it('leaves out a pick whose words left the story, and keeps one still in it that the card no longer offers', () => {
    const edited = [P1.replace('夏天熱得睡不著，', '夏天很熱，'), `> ${P2}`, P3].join('\n\n');
    const options = offlinePassages(edited);
    expect(options.map((o) => o.text)).not.toContain(C);
    const got = pickedIn(edited, [tap('u1', 3, B), tap('u2', 2, C), tap('u3', 1, A)]);
    // B was rewritten: gone. C is still word for word in the quote, though no longer an option: kept.
    expect(got.map((s) => s.text)).toEqual([A, C]);
  });

  it('reads a pick as a pick is read when it is made: whitespace as one, within one block, never across two', () => {
    const latin = 'The quiet after moving out\nfelt like mine, finally. Then the boxes came.';
    const spaced = pickedIn(latin, [{ uid: 'u1', at: 1, passage: { id: 'aaaaaaaa', text: '  The quiet   after moving out felt like mine, ' } }]);
    // The kept text is the squashed one (as verifyPassages keeps it); the id is the pick's own.
    expect(spaced.map((s) => [s.id, s.text])).toEqual([['aaaaaaaa', 'The quiet after moving out felt like mine,']]);
    expect(pickedIn(STORY, [tap('u1', 1, `${B}${P2.slice(0, 6)}`)])).toEqual([]);
    // The same place-finder as verifyPassages: what it keeps, pickedIn finds.
    const kept = verifyPassages(STORY, [A, C, D]);
    expect(pickedIn(STORY, kept.map((k, i) => ({ uid: `u${i}`, at: i, passage: k }))).map((s) => s.id)).toEqual(kept.map((k) => k.id));
  });

  it('takes the newest of a tie by the larger uid, as the list orders them', () => {
    const got = pickedIn(STORY, [tap('ua', 5, A), tap('uc', 5, A), tap('ub', 5, A)]);
    expect(got[0].pickers.map((p) => p.uid)).toEqual(['uc', 'ub', 'ua']);
  });
});

describe('pickedFaces', () => {
  const sentence = (n: number) => pickedIn(STORY, Array.from({ length: n }, (_, i) => tap(`u${i}`, 100 - i, A)))[0];
  const everyone = (uid: string) => ({ uid });

  it('shows at most three, newest first, and says when there are more', () => {
    expect(pickedFaces(sentence(1), everyone, false)).toEqual({ people: [{ uid: 'u0' }], more: false });
    expect(pickedFaces(sentence(3), everyone, false)).toEqual({ people: [{ uid: 'u0' }, { uid: 'u1' }, { uid: 'u2' }], more: false });
    const four = pickedFaces(sentence(4), everyone, false)!;
    expect(four.people).toHaveLength(PICKED_FACES_MAX);
    expect(four.more).toBe(true);
    // A full scan may hide older pickers.
    expect(pickedFaces(sentence(1), everyone, true)!.more).toBe(true);
  });

  it('reads only the candidates: past them nobody is asked, only counted as more', () => {
    const asked: string[] = [];
    const s = sentence(PICKED_CANDIDATES + 3);
    const got = pickedFaces(s, (uid) => (asked.push(uid), uid === 'u5' ? { uid } : null), false)!;
    expect(asked).toEqual(Array.from({ length: PICKED_CANDIDATES }, (_, i) => `u${i}`));
    expect(got).toEqual({ people: [{ uid: 'u5' }], more: true });
  });

  it('leaves a sentence none of whose candidates qualifies out', () => {
    expect(pickedFaces(sentence(2), () => null, false)).toBeNull();
    expect(pickedFaces(sentence(4), (uid) => (uid === 'u1' ? null : { uid }), false)).toEqual({
      people: [{ uid: 'u0' }, { uid: 'u2' }, { uid: 'u3' }],
      more: false,
    });
  });
});
