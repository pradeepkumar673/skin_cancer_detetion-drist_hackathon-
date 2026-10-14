import { test, expect } from '@playwright/test';

test.describe('Design system constraints', () => {
  test('buttons and cards do not exceed 4px border radius', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const elements = await page.locator('button, a[class*="rounded"], div[class*="rounded"]').all();

    for (const el of elements) {
      const radius = await el.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          topLeft: parseFloat(style.borderTopLeftRadius) || 0,
          topRight: parseFloat(style.borderTopRightRadius) || 0,
          bottomRight: parseFloat(style.borderBottomRightRadius) || 0,
          bottomLeft: parseFloat(style.borderBottomLeftRadius) || 0,
        };
      });

      expect(radius.topLeft).toBeLessThanOrEqual(4);
      expect(radius.topRight).toBeLessThanOrEqual(4);
      expect(radius.bottomRight).toBeLessThanOrEqual(4);
      expect(radius.bottomLeft).toBeLessThanOrEqual(4);
    }
  });

  test('no background gradients on any container element', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const hasGradients = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && (bg.includes('linear-gradient') || bg.includes('radial-gradient') || bg.includes('conic-gradient'))) {
          return true;
        }
      }
      return false;
    });

    expect(hasGradients).toBe(false);
  });
});
