import { expect, test } from '@playwright/test';

test('selects, moves to, and mines a visible node through the React UI', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'D-001 · SHAFT' })).toBeVisible();
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * (118 / 480), box!.y + box!.height * (201 / 270));

  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await page.getByRole('button', { name: 'MOVE' }).click();
  const mine = page.getByRole('button', { name: 'MINE' });
  await expect(mine).toBeEnabled({ timeout: 10_000 });
  await page.keyboard.press('Space');
  await expect(page.locator('.context-meta')).not.toContainText('HP 118/118', { timeout: 3_000 });

  await page.reload();
  const restoredBox = await canvas.boundingBox();
  expect(restoredBox).not.toBeNull();
  await page.mouse.click(restoredBox!.x + restoredBox!.width * (118 / 480), restoredBox!.y + restoredBox!.height * (201 / 270));
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await expect(page.locator('.context-meta')).not.toContainText('HP 118/118');
  expect(pageErrors).toEqual([]);
});
