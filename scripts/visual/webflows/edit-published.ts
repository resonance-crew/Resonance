/**
 * edit-published — an edit to a published card is kept as a pending edit until its author applies it.
 *
 * alice opens her published card 寫給十年前的自己, picks 管理卡片 · 編輯 and adds a sentence: the writer saves it as
 * the card's pending edit (PUT /api/v1/cards/letter/edits/current) and says 修改已暫存; readers still see the card as
 * it was. A reload of the writer keeps the sentence. ✓ 完成 · 儲存修改 applies it (POST …/edits/apply) and she lands
 * on the card's page, which shows it.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

export const editPublished: WebFlow = {
  name: 'edit-published',
  proves: 'an edit to a published card is saved through PUT …/edits/current, kept across a reload, and shows on the card once applied',
  account: 'alice',
  warm: ['/card/letter', '/write/letter', '/api/v1/cards/letter', '/api/v1/cards/letter/edits/current', '/api/v1/cards/letter/edits/apply'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    const added = `後來我才明白，轉彎也是路 ${Date.now().toString(36)}`;

    await kit.goto('/card/letter');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: '寫給十年前的自己', level: 1 })).toBeVisible({ timeout: kit.slow });
    step('管理卡片 · 編輯');
    await main.getByRole('button', { name: '管理卡片' }).click();
    await page.getByRole('menuitem', { name: '編輯' }).click();
    await page.waitForURL(/\/write\/letter(\?|$)/, { timeout: kit.slow });

    const story = page.getByRole('textbox', { name: '故事本體' });
    await expect(story).toContainText('你以為的失敗', { timeout: kit.slow });
    const t0 = Date.now();
    step('a sentence at the end');
    await story.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(added);
    const saved = await kit.waitForApi('PUT', /^\/api\/v1\/cards\/letter\/edits\/current$/, { since: t0 });
    const body = saved.body as { story?: string } | null;
    if (!String(body?.story ?? '').includes(added)) throw new Error(`PUT …/edits/current carried ${JSON.stringify(body)}`);
    await expect(page.getByText('修改已暫存')).toBeVisible({ timeout: 10_000 });
    if (kit.apiCalls('PATCH', /^\/api\/v1\/cards\/letter(\/draft)?$/).length) throw new Error('the edit of a published card went out as a PATCH of the card itself');

    step('reload: the pending edit is kept');
    await kit.reload();
    await expect(story).toContainText(added, { timeout: kit.slow });

    step('✓ 完成 · 儲存修改');
    await page.getByRole('button', { name: '完成' }).click();
    const t1 = Date.now();
    await page.getByRole('button', { name: '儲存修改' }).click({ timeout: kit.slow });
    await kit.waitForApi('POST', /^\/api\/v1\/cards\/letter\/edits\/apply$/, { since: t1, status: [200] });
    await page.waitForURL(/\/card\/letter(\?|$)/, { timeout: kit.slow });
    await expect(main.getByText(added)).toBeVisible({ timeout: kit.slow });

    step('a reload of the card page shows it too');
    await kit.reload();
    await expect(main.getByText(added)).toBeVisible({ timeout: kit.slow });
  },
};
