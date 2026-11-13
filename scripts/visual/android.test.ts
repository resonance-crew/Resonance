import { describe, expect, it } from 'vitest';
import en from '../../src/messages/en.json';
import zhTW from '../../src/messages/zh-TW.json';
import { stillLoading } from './android';

// The 2.5.0 release run kept three Android card pages taken before they loaded: a skeleton holds still as long as a
// page does. The app names its skeletons for TalkBack (L10n.Home.moreLoading), and uiautomator's dump shows that name.
describe('stillLoading', () => {
  const node = (attrs: string) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" ${attrs} /></hierarchy>`;

  it('sees the card page’s skeleton in either language', () => {
    expect(stillLoading(node(`content-desc="${zhTW.home.moreLoading}"`))).toBe(true);
    expect(stillLoading(node(`content-desc="${en.home.moreLoading}"`))).toBe(true);
  });

  it('passes a loaded page, and a page whose words merely mention loading', () => {
    expect(stillLoading(node('content-desc="搬家後的第一個安靜夜晚"'))).toBe(false);
    expect(stillLoading(node(`content-desc="${zhTW.home.moreLoading}的故事"`))).toBe(false);
    // No hierarchy (uiautomator couldn't dump): nothing to judge by.
    expect(stillLoading('')).toBe(false);
  });
});
