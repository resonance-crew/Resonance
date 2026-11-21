/**
 * block-person — blocking and unblocking someone goes through the server, and the page says so.
 *
 * alice opens bob's profile, picks 封鎖 from its 檢舉或封鎖 menu and confirms (PUT /api/v1/me/blocks/bob: one server
 * transaction that blocks and ends their connection). The profile then says 你已封鎖 bob and no longer offers 傳訊息.
 * In her settings (隱私與連結 · 管理封鎖名單) the block list (GET /api/v1/me/blocks) names bob; 解除 unblocks him
 * (DELETE /api/v1/me/blocks/bob) and the list says it is empty.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

export const blockPerson: WebFlow = {
  name: 'block-person',
  proves: 'blocking from a profile and unblocking from settings go through /api/v1/me/blocks, and each page shows the change',
  account: 'alice',
  warm: ['/u/bob', '/settings', '/api/v1/users/bob', '/api/v1/me/blocks', '/api/v1/me/blocks/bob'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    await kit.goto('/u/bob');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'bob', level: 1 })).toBeVisible({ timeout: kit.slow });
    await expect(main.getByRole('button', { name: '傳訊息' })).toBeVisible({ timeout: kit.slow });

    step('檢舉或封鎖 · 封鎖');
    await main.getByRole('button', { name: '檢舉或封鎖' }).click();
    await page.getByRole('menuitem', { name: '封鎖' }).click();
    const dialog = page.getByRole('dialog', { name: '封鎖 bob？' });
    await expect(dialog).toBeVisible();
    const t0 = Date.now();
    await dialog.getByRole('button', { name: '封鎖' }).click();
    await kit.waitForApi('PUT', /^\/api\/v1\/me\/blocks\/bob$/, { since: t0, status: [204] });
    await expect(main.getByText('你已封鎖 bob')).toBeVisible({ timeout: 10_000 });
    await expect(main.getByRole('button', { name: '傳訊息' })).toHaveCount(0);

    step('the block list in settings');
    await kit.goto('/settings');
    // A tab beside the section on a wide screen; on a phone a row of the settings menu, opening its page.
    await page.getByRole(kit.phone ? 'button' : 'tab', { name: '隱私與連結' }).click({ timeout: kit.slow });
    await page.getByRole('button', { name: '管理封鎖名單' }).click();
    const list = page.getByRole('dialog', { name: '封鎖名單' });
    await expect(list).toBeVisible({ timeout: kit.slow });
    await expect(list.getByText('bob', { exact: true })).toBeVisible({ timeout: kit.slow });
    await kit.waitForApi('GET', /^\/api\/v1\/me\/blocks$/, { since: t0 });

    step('解除');
    const t2 = Date.now();
    await list.getByRole('button', { name: /解除/ }).click();
    await kit.waitForApi('DELETE', /^\/api\/v1\/me\/blocks\/bob$/, { since: t2, status: [204] });
    await expect(list.getByText('你還沒有封鎖任何人')).toBeVisible({ timeout: 10_000 });

    step('bob’s profile is his again');
    await kit.goto('/u/bob');
    await expect(main.getByRole('heading', { name: 'bob', level: 1 })).toBeVisible({ timeout: kit.slow });
    await expect(main.getByText('你已封鎖 bob')).toHaveCount(0);
  },
};
