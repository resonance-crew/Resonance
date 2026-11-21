/**
 * live-message — a message reaches an open page by itself, and the viewer's own send stays.
 *
 * alice sits on her thread with bob and does nothing; bob sends from outside (his own phone: POST /api/v1/messages
 * with his ID token). His words appear in the open thread within 10 s with no reload: the server raises alice's
 * `signals/alice` threads counter, the page's one listener hears it and pulls GET …/conversations/alice_bob/messages.
 * Back on the conversation list, a second message from bob appears there by itself (the `inbox` counter, GET
 * /conversations). Then alice sends: drawn at once, POST /api/v1/messages, and still there after a reload.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

const LIVE_MS = 10_000;

export const liveMessage: WebFlow = {
  name: 'live-message',
  proves: 'a message from someone else reaches an open thread and the conversation list without a reload; your own send is drawn at once and kept',
  account: 'alice',
  warm: ['/messages/bob', '/messages', '/api/v1/messages', '/api/v1/conversations', '/api/v1/conversations/alice_bob', '/api/v1/conversations/alice_bob/messages', '/api/v1/conversations/alice_bob/read'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    const stamp = Date.now().toString(36);
    let navigations = 0;
    page.on('framenavigated', (f) => f === page.mainFrame() && navigations++);

    await kit.goto('/messages/bob');
    const composer = page.getByRole('textbox', { name: '與 bob 的對話' });
    // The open thread's messages (the list beside it, on a wide screen, shows the newest too).
    const thread = page.getByRole('main').locator('section');
    await expect(composer).toBeVisible({ timeout: kit.slow });
    step('the thread is open: a seeded message of hers shows');
    await expect(thread.getByText('那篇雨後散步寫得好好')).toBeVisible({ timeout: kit.slow });
    // The page settles first (its first reads, the listener's first answer): what comes later is the signal's doing.
    await page.waitForTimeout(1500);

    const bob = await kit.asUser('bob');
    const first = `bob 從外面傳來 ${stamp}`;
    step(`bob sends “${first}” from outside`);
    const navBefore = navigations;
    const sentAt = Date.now();
    await bob.call('POST', '/api/v1/messages', { to: 'alice', text: first }, 201);
    await expect(thread.getByText(first)).toBeVisible({ timeout: LIVE_MS });
    step(`shown after ${Date.now() - sentAt} ms`);
    if (navigations !== navBefore) throw new Error('the page navigated while waiting for bob’s message (a reload is not live)');
    await kit.waitForApi('GET', /^\/api\/v1\/conversations\/alice_bob\/messages\?/, { since: sentAt, timeout: 1000 });

    step('back to the conversation list');
    const list = page.getByRole('complementary');
    if (kit.phone) {
      await page.getByRole('link', { name: '所有對話' }).or(page.getByRole('button', { name: '所有對話' })).first().click();
      await page.waitForURL(/\/messages(\?|$)/, { timeout: kit.slow });
    }
    await expect(list.getByText(first)).toBeVisible({ timeout: kit.slow });
    await page.waitForTimeout(1000);
    const second = `第二則 ${stamp}`;
    step(`bob sends “${second}”`);
    const navBefore2 = navigations;
    const sentAt2 = Date.now();
    await bob.call('POST', '/api/v1/messages', { to: 'alice', text: second }, 201);
    await expect(list.getByText(second)).toBeVisible({ timeout: LIVE_MS });
    step(`the list shows it after ${Date.now() - sentAt2} ms`);
    if (navigations !== navBefore2) throw new Error('the page navigated while waiting for bob’s second message');
    await kit.waitForApi('GET', /^\/api\/v1\/conversations(\?|$)/, { since: sentAt2, timeout: 1000 });

    if (kit.phone) {
      step('into the thread again');
      await list.getByText(second).click();
      await page.waitForURL(/\/messages\/bob(\?|$)/, { timeout: kit.slow });
    }
    const mine = `alice 回覆 ${stamp}`;
    step(`alice types “${mine}” and sends`);
    await expect(composer).toBeVisible({ timeout: kit.slow });
    await composer.fill(mine);
    const clicked = Date.now();
    await page.getByRole('button', { name: '送出' }).click();
    await expect(thread.getByText(mine)).toBeVisible({ timeout: 1500 });
    step(`drawn ${Date.now() - clicked} ms after 送出`);
    const sent = await kit.waitForApi('POST', /^\/api\/v1\/messages$/, { since: clicked, status: [201] });
    if ((sent.body as { text?: string } | null)?.text !== mine) throw new Error(`POST /api/v1/messages carried ${JSON.stringify(sent.body)}`);
    await expect(composer).toHaveValue('');

    step('reload: her message is still there');
    await kit.reload();
    await expect(thread.getByText(mine)).toBeVisible({ timeout: kit.slow });
    await expect(thread.getByText(first)).toBeVisible();
  },
};
