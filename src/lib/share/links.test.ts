import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zh from '@/messages/zh-TW.json';
import {
  cardShareKey,
  cardShareUrl,
  intentUrl,
  popupFeatures,
  profileShareUrl,
  sharePostText,
  shareTitle,
  shareUrl,
  type ShareTarget,
  type ShareTranslate,
} from './links';

const ORIGIN = 'https://resonance.channel';
const tZh = createTranslator({ locale: 'zh-TW', messages: zh }) as unknown as ShareTranslate;
const tEn = createTranslator({ locale: 'en', messages: en }) as unknown as ShareTranslate;

const named: ShareTarget = { kind: 'card', id: 'c7Hq', slug: 'pickled-plums-nian', title: '外婆的醃梅子', anonymous: false, handle: '念誠' };
const anonymous: ShareTarget = { ...named, anonymous: true, handle: '念誠' };

describe('the link a card is shared by', () => {
  it('is the slug, with no locale and no tracking', () => {
    expect(cardShareUrl(named, ORIGIN)).toBe('https://resonance.channel/card/pickled-plums-nian');
  });

  it('falls back to the id for a card with no slug', () => {
    expect(cardShareUrl({ id: 'c7Hq', slug: null }, ORIGIN)).toBe('https://resonance.channel/card/c7Hq');
    expect(cardShareUrl({ id: 'c7Hq', slug: '' }, ORIGIN)).toBe('https://resonance.channel/card/c7Hq');
  });

  // A slug that collided carries its author's pen name, and slugs never change.
  it('is always the id for an anonymous card — never a slug, which may name its author', () => {
    expect(cardShareKey(anonymous)).toBe('c7Hq');
    expect(cardShareUrl(anonymous, ORIGIN)).toBe('https://resonance.channel/card/c7Hq');
    expect(shareUrl(anonymous, ORIGIN)).not.toMatch(/nian|念誠/);
  });

  it('names a profile by its pen name, encoded', () => {
    expect(profileShareUrl('念誠', ORIGIN)).toBe('https://resonance.channel/u/%E5%BF%B5%E8%AA%A0');
    expect(shareUrl({ kind: 'profile', handle: 'a b' }, ORIGIN)).toBe('https://resonance.channel/u/a%20b');
  });
});

describe('the words a post starts with', () => {
  it("is a named card's title and pen name", () => {
    expect(sharePostText(named, tZh)).toBe('「外婆的醃梅子」｜念誠');
    expect(sharePostText(named, tEn)).toBe('“外婆的醃梅子” by 念誠');
  });

  it("is an anonymous card's title alone, whatever the page knows of its author", () => {
    expect(sharePostText(anonymous, tZh)).toBe('「外婆的醃梅子」');
    expect(sharePostText(anonymous, tEn)).toBe('“外婆的醃梅子”');
  });

  it("is a profile's share title", () => {
    expect(sharePostText({ kind: 'profile', handle: '念誠' }, tZh)).toBe('念誠 · Resonance');
    expect(shareTitle({ kind: 'profile', handle: '念誠' }, tEn)).toBe('念誠 · Resonance');
    expect(shareTitle(named, tEn)).toBe('外婆的醃梅子');
  });
});

describe('the platforms’ intents', () => {
  const url = 'https://resonance.channel/card/a-b';
  // A title with an ampersand and a hash must not end the parameter or start a fragment.
  const text = '「Tom & Jerry #1」｜念誠';
  const enc = encodeURIComponent(text);

  it('opens LINE’s documented share button', () => {
    expect(intentUrl('line', { url, text })).toBe(
      `https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Fresonance.channel%2Fcard%2Fa-b&text=${enc}`,
    );
    expect(enc).toContain('%26');
    expect(enc).toContain('%23');
  });

  it('opens a Threads post and an X post with the words and the link', () => {
    expect(intentUrl('threads', { url, text })).toBe(
      `https://www.threads.com/intent/post?text=${enc}&url=https%3A%2F%2Fresonance.channel%2Fcard%2Fa-b`,
    );
    expect(intentUrl('x', { url, text })).toBe(
      `https://x.com/intent/tweet?text=${enc}&url=https%3A%2F%2Fresonance.channel%2Fcard%2Fa-b`,
    );
  });

  it('opens Facebook’s Share Dialog with the Meta App ID, and sharer.php without one', () => {
    expect(intentUrl('facebook', { url, text }, { metaAppId: '1115208464203859' })).toBe(
      'https://www.facebook.com/dialog/share?app_id=1115208464203859&href=https%3A%2F%2Fresonance.channel%2Fcard%2Fa-b&display=popup',
    );
    expect(intentUrl('facebook', { url, text })).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fresonance.channel%2Fcard%2Fa-b',
    );
    expect(intentUrl('facebook', { url, text }, { metaAppId: '' })).toContain('sharer.php');
    // The post is the link's preview card: no words of ours, no hashtag, no redirect_uri.
    expect(intentUrl('facebook', { url, text }, { metaAppId: '1' })).not.toMatch(/quote|hashtag|redirect_uri/);
  });
});

describe('the intent popup', () => {
  it('is 600 × 640, centred on the window it opens from, and keeps no line back to it', () => {
    expect(popupFeatures({ screenX: 100, screenY: 50, outerWidth: 1400, outerHeight: 900 })).toBe(
      'popup,width=600,height=640,left=500,top=180,noopener,noreferrer',
    );
    // Never off the screen's top-left edge.
    expect(popupFeatures({ screenX: 0, screenY: 0, outerWidth: 400, outerHeight: 500 })).toBe(
      'popup,width=600,height=640,left=0,top=0,noopener,noreferrer',
    );
  });
});
