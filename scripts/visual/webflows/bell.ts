/**
 * bell — the header's bell counts a ring the moment it happens, and the notifications page lists it.
 *
 * alice sits on the home feed; bob taps (共振) her card 寫給十年前的自己 from outside (PUT /api/v1/cards/letter/tap:
 * the cheapest thing that rings someone's bell). The server writes her bell row after its answer and raises her
 * `signals/alice` bell counter; the page's listener hears it and pulls GET /api/v1/me/bell, and the badge on the
 * header's 通知 goes up by one with no reload. The notifications page then lists 「bob 與你的卡片共振了」.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

const LIVE_MS = 10_000;

export const bell: WebFlow = {
  name: 'bell',
  proves: 'a ring from someone else raises the header’s bell badge without a reload, and the notifications page lists it',
  account: 'alice',
  warm: ['/home', '/notifications', '/api/v1/me/bell', '/api/v1/cards/letter/tap', '/api/v1/notifications/read'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    let navigations = 0;
    page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);

    await kit.goto('/home');
    await expect(page.getByRole('heading', { name: '共振場' })).toBeVisible({ timeout: kit.slow });
    const bellLink = page.getByRole('banner').getByRole('link', { name: '通知' });
    const count = async () => Number((await bellLink.textContent())?.match(/\d+/)?.[0] ?? 0);
    // The seeded world leaves three rows unread (scripts/seed-emulator.ts).
    await expect(bellLink).toHaveText(/3/, { timeout: kit.slow });
    const before = await count();
    step(`the badge says ${before}`);
    await page.waitForTimeout(1500);

    const bob = await kit.asUser('bob');
    step('bob taps her card 寫給十年前的自己 from outside');
    const navBefore = navigations;
    const tappedAt = Date.now();
    await bob.call('PUT', '/api/v1/cards/letter/tap');
    await expect(bellLink).toHaveText(new RegExp(String(before + 1)), { timeout: LIVE_MS });
    step(`the badge says ${await count()} after ${Date.now() - tappedAt} ms`);
    if (navigations !== navBefore) throw new Error('the page navigated while waiting for the bell (a reload is not live)');
    await kit.waitForApi('GET', /^\/api\/v1\/me\/bell\?/, { since: tappedAt, timeout: 1000 });

    step('the notifications page lists the ring');
    await kit.goto('/notifications');
    await expect(page.getByRole('main').getByText('bob 與你的卡片共振了')).toBeVisible({ timeout: kit.slow });
    // Under 今天, just now (the seeded rows are all from the world's fixed day).
    await expect(page.getByRole('main').getByText('今天')).toBeVisible();
    await expect(page.getByRole('main').getByText('剛剛')).toBeVisible();
  },
};
