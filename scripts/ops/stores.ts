/**
 * Store review states for the daily check, behind one interface so a source can be added
 * without touching the report. Without new credentials there is no read-only way in: the result
 * comes by e-mail and the consoles need the owner's login. So today each source says how to look
 * by hand, and the App Store one starts working the day an App Store Connect API key exists
 * (docs/release/automation-options.md):
 *
 *   ASC_READ_KEY_ID, ASC_ISSUER_ID   the key's ids (App Store Connect → Users and Access → Integrations)
 *   ASC_READ_KEY_PATH                its .p8, kept in the git-ignored keys/
 *   ASC_APP_ID                       the app's Apple id (App Information → Apple ID)
 *
 * Only GETs are made. Google Play's API reports a track's release status, not a review state,
 * so Play stays a pointer to the console.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type StoreState = { store: string; platform: string; version: string; state: string; since?: string };
export type StoreReading = { source: string; states: StoreState[] } | { source: string; unavailable: string };

export interface ReviewStatusSource {
  name: string;
  read(): Promise<StoreReading>;
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** An App Store Connect API token: ES256, audience appstoreconnect-v1, at most 20 minutes. */
export function ascToken(keyId: string, issuerId: string, p8: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: issuerId, iat: nowSec, exp: nowSec + 15 * 60, aud: 'appstoreconnect-v1' }));
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(p8), dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(signature)}`;
}

type AscVersions = { data?: { attributes?: { platform?: string; versionString?: string; appStoreState?: string; appVersionState?: string; createdDate?: string } }[] };

/** The newest version per platform from `GET /v1/apps/{id}/appStoreVersions`. */
export function parseAscVersions(body: AscVersions): StoreState[] {
  const seen = new Set<string>();
  const out: StoreState[] = [];
  const rows = [...(body.data ?? [])].sort((a, b) => String(b.attributes?.createdDate ?? '').localeCompare(String(a.attributes?.createdDate ?? '')));
  for (const row of rows) {
    const a = row.attributes ?? {};
    const platform = a.platform ?? '?';
    if (seen.has(platform)) continue;
    seen.add(platform);
    out.push({ store: 'App Store', platform, version: a.versionString ?? '?', state: a.appVersionState ?? a.appStoreState ?? '?', since: a.createdDate });
  }
  return out;
}

export const ASC_BY_HAND =
  'App Store Connect → Apps → Resonance → each platform\'s version (or the review result e-mail). Automatic once an API key is set: ASC_READ_KEY_ID, ASC_ISSUER_ID, ASC_READ_KEY_PATH, ASC_APP_ID (docs/release/automation-options.md)';

export class AscReviewSource implements ReviewStatusSource {
  name = 'App Store Connect';
  constructor(
    private env: Record<string, string | undefined> = process.env,
    private fetcher: typeof fetch = fetch,
    private readKey: (path: string) => string = (p) => readFileSync(p, 'utf8'),
  ) {}

  configured(): boolean {
    const e = this.env;
    return Boolean(e.ASC_READ_KEY_ID && e.ASC_ISSUER_ID && e.ASC_READ_KEY_PATH && e.ASC_APP_ID);
  }

  async read(): Promise<StoreReading> {
    if (!this.configured()) return { source: this.name, unavailable: ASC_BY_HAND };
    const e = this.env;
    try {
      const token = ascToken(e.ASC_READ_KEY_ID!, e.ASC_ISSUER_ID!, this.readKey(e.ASC_READ_KEY_PATH!));
      const url = `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(e.ASC_APP_ID!)}/appStoreVersions?limit=6&fields[appStoreVersions]=platform,versionString,appStoreState,appVersionState,createdDate`;
      const res = await this.fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return { source: this.name, unavailable: `the API answered ${res.status}; ${ASC_BY_HAND}` };
      return { source: this.name, states: parseAscVersions((await res.json()) as AscVersions) };
    } catch (err) {
      return { source: this.name, unavailable: `couldn't ask (${(err as Error).message.split('\n')[0]}); ${ASC_BY_HAND}` };
    }
  }
}

export class PlayReviewSource implements ReviewStatusSource {
  name = 'Google Play';
  async read(): Promise<StoreReading> {
    return {
      source: this.name,
      unavailable: 'Play Console → 發布總覽 (Publishing overview) shows what is in review; the result also comes by e-mail. Play\'s API has no review state to read.',
    };
  }
}

export const defaultSources = (): ReviewStatusSource[] => [new AscReviewSource(), new PlayReviewSource()];
