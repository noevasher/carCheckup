import { expect, type Page } from '@playwright/test';

/**
 * After registering a vehicle the app asks for notifications (once per device) and, if push is
 * not possible, whether to use email (feature 003). Tests that are not about that flow decline.
 */
export async function dismissNotificationsPrompt(page: Page): Promise<void> {
  const later = page.getByRole('button', { name: 'Ahora no' });
  const noEmail = page.getByRole('button', { name: 'No, gracias' });
  await expect(later.or(noEmail)).toBeVisible();
  if (await later.isVisible()) await later.click();
  await noEmail.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
