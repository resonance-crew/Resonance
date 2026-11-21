import { describe, expect, it } from 'vitest';
import { ClientConfig } from '@/lib/api/v1/schemas';
import { clientConfigOf, DEFAULT_FEATURES } from './clientConfig';

describe('clientConfigOf', () => {
  it('with nothing set: no build must or should update, and the default flags (drafts still off)', () => {
    const config = clientConfigOf({});
    expect(config).toEqual({
      minBuild: { ios: 0, android: 0 },
      recommendedBuild: { ios: 0, android: 0 },
      features: { signals: true, apiSocial: true, apiInbox: true, apiBell: true, apiThoughtMap: true, apiDrafts: false },
    });
    expect(ClientConfig.safeParse(config).success).toBe(true);
  });

  it('reads each platform apart, and never recommends below the minimum', () => {
    expect(
      clientConfigOf({ CLIENT_MIN_BUILD_IOS: '17', CLIENT_MIN_BUILD_ANDROID: ' 18 ', CLIENT_RECOMMENDED_BUILD_IOS: '20', CLIENT_RECOMMENDED_BUILD_ANDROID: '3' }),
    ).toMatchObject({ minBuild: { ios: 17, android: 18 }, recommendedBuild: { ios: 20, android: 18 } });
  });

  it('a malformed build number locks no one out: it reads as 0', () => {
    for (const bad of ['-3', '1.5', 'seventeen', '', '1e3', '9999999999']) {
      expect(clientConfigOf({ CLIENT_MIN_BUILD_IOS: bad }).minBuild.ios, bad).toBe(0);
    }
  });

  it('lays CLIENT_FEATURES over the defaults: known flags with boolean values only', () => {
    expect(clientConfigOf({ CLIENT_FEATURES: '{"apiDrafts":true,"apiInbox":false,"unknown":true,"apiBell":"no"}' }).features).toEqual({
      ...DEFAULT_FEATURES,
      apiDrafts: true,
      apiInbox: false,
    });
    for (const bad of ['not json', '[true]', 'null', '"x"']) expect(clientConfigOf({ CLIENT_FEATURES: bad }).features).toEqual(DEFAULT_FEATURES);
  });
});
