/**
 * thought-map — putting a card on the thought map and moving it are saved through batched ops, and stay.
 *
 * alice opens her thought map (/me/thought-map: three cards and a group, seeded), puts 港邊的那盞燈 on it from
 * 加入卡片's tray, and drags it with the pointer. Each change goes out as POST /api/v1/me/thought-map/ops — a drag's
 * many moves gathered into a batch or two, never a request per pointer move — and after a reload the card is where
 * she left it.
 */
import { expect, type FlowKit, type WebFlow } from './kit';

const CARD = 'harbour-lamp';
const OPS = /^\/api\/v1\/me\/thought-map\/ops$/;

export const thoughtMap: WebFlow = {
  name: 'thought-map',
  proves: 'adding a card to the thought map and dragging it go out as batched POST /me/thought-map/ops, and a reload keeps the node where it was left',
  account: 'alice',
  warm: ['/me/thought-map', '/api/v1/me/thought-map', '/api/v1/me/thought-map/ops', '/api/v1/me/cardbox'],
  run: async (kit: FlowKit) => {
    const { page, step } = kit;
    await kit.goto('/me/thought-map');
    const node = (id: string) => page.locator(`[data-card-id="${id}"]`);
    await expect(node('letter')).toBeVisible({ timeout: kit.slow });
    await expect(node(CARD)).toHaveCount(0);

    step('加入卡片 · 港邊的那盞燈');
    const t0 = Date.now();
    await page.getByRole('button', { name: '加入卡片' }).first().click();
    await expect(page.getByText('選一張卡片加入')).toBeVisible();
    await page.getByRole('button', { name: /港邊的那盞燈/ }).click();
    await expect(node(CARD)).toBeVisible({ timeout: 10_000 });
    const added = await kit.waitForApi('POST', OPS, { since: t0 });
    step(`added: ${JSON.stringify(added.body).slice(0, 200)}`);
    if (!JSON.stringify(added.body).includes(CARD)) throw new Error(`the ops sent after adding the card don't name it: ${JSON.stringify(added.body)}`);

    const at = async () => node(CARD).evaluate((el) => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
    // Out of the way of whatever the map puts in its middle: the card is moved from its own middle.
    await page.waitForTimeout(800);
    const before = await at();
    const box = (await node(CARD).boundingBox())!;
    step(`drag it from (${before.x}, ${before.y})`);
    const t1 = Date.now();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const moves = 24;
    for (let i = 1; i <= moves; i++) {
      await page.mouse.move(sx - 6 * i, sy + 5 * i);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const after = await at();
    if (Math.abs(after.x - before.x) < 20 && Math.abs(after.y - before.y) < 20) throw new Error(`the node didn't move: ${JSON.stringify({ before, after })}`);
    step(`dropped at (${after.x}, ${after.y})`);
    await kit.waitForApi('POST', OPS, { since: t1 });
    // Whatever was still being gathered goes out.
    await page.waitForTimeout(1500);
    const batches = kit.apiCalls('POST', OPS, t1);
    step(`${moves} pointer moves → ${batches.length} POST …/ops`);
    if (batches.length > 4) throw new Error(`the drag sent ${batches.length} ops requests for ${moves} pointer moves (not batched)`);
    const last = JSON.stringify(batches[batches.length - 1].body);
    if (!last.includes(CARD)) throw new Error(`the last ops batch doesn't name the moved card: ${last}`);
    for (const b of batches) if (b.status !== 200 && b.status !== 204) throw new Error(`POST …/ops answered ${b.status}`);

    step('reload: the node is where she left it');
    await kit.reload();
    await expect(node(CARD)).toBeVisible({ timeout: kit.slow });
    const kept = await at();
    if (Math.abs(kept.x - after.x) > 1 || Math.abs(kept.y - after.y) > 1) {
      throw new Error(`after a reload the node is at (${kept.x}, ${kept.y}), left at (${after.x}, ${after.y})`);
    }
  },
};
