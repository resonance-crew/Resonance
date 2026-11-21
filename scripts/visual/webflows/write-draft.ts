/**
 * write-draft — a new card's words are saved through the writer's outbox, survive a reload and an offline stretch,
 * and publish.
 *
 * alice writes a new card: a title and a line of story. The first save makes the card (POST /api/v1/cards), the
 * next ones patch it (PATCH /api/v1/cards/{id}/draft), each carrying a higher `rev`. A reload keeps the words. Then
 * the browser goes offline: she types more, and the writer's bar says 未儲存 (what a person sees while unsaved).
 * Back online the outbox sends by itself — no keypress — and the bar says 已儲存; a reload shows the later words.
 * Then she publishes (✓ 完成 · 公開 · 發布: POST …/publish) and lands on the card's page.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

/** PATCH …/draft's body: the fields that change, `clear` (those removed) and `rev`. */
type DraftBody = { rev?: number; story?: string } | null;

export const writeDraft: WebFlow = {
  name: 'write-draft',
  proves: 'a new card autosaves through POST /cards and PATCH …/draft with a rising rev, keeps its words across a reload and an offline stretch, and publishes',
  account: 'alice',
  warm: ['/write', '/write/x', '/card/x', '/api/v1/cards', '/api/v1/cards/x/draft', '/api/v1/cards/x/publish', '/api/v1/cards/x/edits/current', '/api/v1/cards/x/private-shares'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    const stamp = Date.now().toString(36);
    const title = `雨夜的公車站 ${stamp}`;
    const line1 = '末班車遲到了十分鐘';
    const line2 = '，我們在站牌下聊完了一整年';
    const offlineWords = '。離線時寫下的這一句';

    await kit.goto('/write');
    const titleBox = page.getByRole('textbox', { name: '一句話標題' });
    const story = page.getByRole('textbox', { name: '故事本體' });
    await expect(titleBox).toBeVisible({ timeout: kit.slow });

    const t0 = Date.now();
    step('title and a line of story');
    await titleBox.fill(title);
    await story.click();
    await page.keyboard.type(line1);
    const created = await kit.waitForApi('POST', /^\/api\/v1\/cards$/, { since: t0, status: [201] });
    const id = (created.body as { id?: string } | null)?.id;
    if (!id) throw new Error(`POST /api/v1/cards carried no id: ${JSON.stringify(created.body)}`);
    await page.waitForURL(new RegExp(`/write/${id}(\\?|$)`), { timeout: 10_000 });
    step(`the card is ${id}; more words`);
    const draftPath = new RegExp(`^/api/v1/cards/${id}/draft$`);
    await page.keyboard.type(line2);
    await kit.waitForApi('PATCH', draftPath, { since: t0 });
    await expect(page.getByText('已儲存')).toBeVisible({ timeout: 10_000 });

    step('reload: the words are kept');
    await kit.reload();
    await expect(titleBox).toHaveValue(title, { timeout: kit.slow });
    await expect(story).toContainText(line1 + line2, { timeout: kit.slow });

    step('offline: more words, and the bar says 未儲存');
    await kit.context.setOffline(true);
    await story.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(offlineWords);
    await expect(page.getByText('未儲存')).toBeVisible({ timeout: 20_000 });
    await expect(story).toContainText(offlineWords);

    step('online again: the outbox sends by itself');
    const online = Date.now();
    await kit.context.setOffline(false);
    const resent = await kit.waitForApi('PATCH', draftPath, { since: online, status: [200] });
    const resentStory = String((resent.body as DraftBody)?.story ?? '');
    if (!resentStory.includes(offlineWords.slice(1))) throw new Error(`the send after the offline stretch carried story “${resentStory}”`);
    step(`sent ${resent.at - online} ms after going online`);
    // The words are stored now: the bar should say so, as it does after any save.
    await kit.soft('the bar after the outbox sent the offline words', () => expect(page.getByText('已儲存')).toBeVisible({ timeout: 15_000 }));

    const revs = kit.apiCalls('PATCH', draftPath).map((c) => (c.body as DraftBody)?.rev);
    step(`revs sent: ${revs.join(', ')}`);
    if (revs.some((r) => typeof r !== 'number')) throw new Error(`a PATCH …/draft carried no rev: ${JSON.stringify(revs)}`);
    const sent = revs as number[];
    // A send that failed offline goes again with its own rev (or a later one); never a lower one after a higher.
    for (let i = 1; i < sent.length; i++) {
      if (sent[i] < sent[i - 1]) throw new Error(`rev went down: ${sent.join(', ')}`);
    }
    if (sent[sent.length - 1] <= sent[0]) throw new Error(`rev never rose: ${sent.join(', ')}`);

    step('reload: the later words are there');
    await kit.reload();
    await expect(story).toContainText(offlineWords, { timeout: kit.slow });

    step('✓ 完成 · 公開 · 發布');
    await page.getByRole('button', { name: '完成' }).click();
    // 卡片類型: a new card starts as a 私人卡; 公開 turns the step's verb to 發布.
    await page.getByRole('button', { name: '公開', exact: true }).click({ timeout: kit.slow });
    const t1 = Date.now();
    await page.getByRole('button', { name: '發布', exact: true }).click();
    await kit.waitForApi('POST', new RegExp(`^/api/v1/cards/${id}/publish$`), { since: t1, status: [200] });
    await page.waitForURL(/\/card\//, { timeout: kit.slow });
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: kit.slow });
    await expect(page.getByRole('main').getByText(offlineWords.slice(1))).toBeVisible();
  },
};
