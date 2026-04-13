/**
 * Drag-and-drop helpers for @hello-pangea/dnd.
 *
 * @hello-pangea/dnd doesn't work with Playwright's native dragTo().
 * We simulate mouse events manually with intermediate move points.
 */
import type { Page, Locator } from '@playwright/test';

/**
 * Drag source element to target element.
 * Retries up to `retries` times on failure.
 */
export async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  retries = 3,
): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await _dragTo(page, source, target);
      return;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await page.waitForTimeout(500);
    }
  }
}

async function _dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const srcBox = await source.boundingBox();
  const dstBox = await target.boundingBox();
  if (!srcBox || !dstBox) throw new Error('dragTo: could not get bounding boxes');

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const dstX = dstBox.x + dstBox.width / 2;
  const dstY = dstBox.y + dstBox.height / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // Move in small steps to trigger drag events
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      srcX + ((dstX - srcX) * i) / steps,
      srcY + ((dstY - srcY) * i) / steps,
      { steps: 1 },
    );
  }
  await page.waitForTimeout(100);
  await page.mouse.up();
}
