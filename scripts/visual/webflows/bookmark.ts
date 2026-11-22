/**
 * bookmark — bookmarking someone's card and taking it back go through the server, and the 收藏 shelf follows.
 *
 * alice bookmarks bob's 一場雨後的散步 from its page (PUT /api/v1/me/bookmarks/rain-walk; the glyph turns to
 * 取消收藏). Her card box's 收藏 shelf (GET /api/v1/me/cards?tab=bookmarks) shows the card. Back on its page she
 * takes it back (DELETE …/bookmarks/rain-walk), and the shelf is empty again.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

const TITLE = '一場雨後的散步';

async function openShelf(kit: FlowKit) {
  const { page } = kit;
  await kit.goto('/me');
  const main = page.getByRole('main');
  if (kit.phone) {
    // A phone picks the shelf from 顯示; a wide screen has a row of shelves.
    const show = main.getByRole('combobox', { name: '顯示' });
    await expect(show).toBeVisible({ timeout: kit.slow });
    await show.click();
    await page.getByRole('option', { name: '收藏' }).click();
  } else {
    const shelf = main.getByRole('tab', { name: '收藏', exact: true }).or(main.getByRole('button', { name: '收藏', exact: true }));
    await expect(shelf).toBeVisible({ timeout: kit.slow });
    await shelf.click();
  }
}

export const bookmark: WebFlow = {
  name: 'bookmark',
  proves: 'bookmarking a card and taking it back go through PUT / DELETE /me/bookmarks, and the 收藏 shelf shows the card in between',
  account: 'alice',
  warm: ['/card/rain-walk', '/me', '/api/v1/cards/rain-walk', '/api/v1/me/bookmarks/rain-walk', '/api/v1/me/cards', '/api/v1/cards/rain-walk/read', '/api/v1/cards/rain-walk/reading', '/api/v1/invites'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    const main = page.getByRole('main');
    await kit.goto('/card/rain-walk');
    await expect(main.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible({ timeout: kit.slow });

    step('收藏');
    const t0 = Date.now();
    await main.getByRole('button', { name: '收藏', exact: true }).click();
    await kit.waitForApi('PUT', /^\/api\/v1\/me\/bookmarks\/rain-walk$/, { since: t0 });
    await expect(main.getByRole('button', { name: '取消收藏' })).toBeVisible({ timeout: 10_000 });

    step('the 收藏 shelf shows it');
    await openShelf(kit);
    await expect(main.getByRole('heading', { name: TITLE, level: 3 })).toBeVisible({ timeout: kit.slow });

    step('取消收藏 on its page');
    await kit.goto('/card/rain-walk');
    const undo = main.getByRole('button', { name: '取消收藏' });
    await expect(undo).toBeVisible({ timeout: kit.slow });
    const t1 = Date.now();
    await undo.click();
    await kit.waitForApi('DELETE', /^\/api\/v1\/me\/bookmarks\/rain-walk$/, { since: t1 });
    await expect(main.getByRole('button', { name: '收藏', exact: true })).toBeVisible({ timeout: 10_000 });

    step('the shelf is empty again');
    await openShelf(kit);
    await expect(main.getByText('讀到捨不得忘記的故事時')).toBeVisible({ timeout: kit.slow });
    await expect(main.getByRole('heading', { name: TITLE, level: 3 })).toHaveCount(0);
  },
};
