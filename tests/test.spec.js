import { test, expect } from '@playwright/test';

test('authentication', async ({ page }) => {

  await page.goto('https://auth.alpha.simadvisory.com/realms/D_SPRICED/protocol/openid-connect/auth?client_id=CHN_D_SPRICED_Client&redirect_uri=https%3A%2F%2Fdev-spriced-cdbu.alpha.simadvisory.com%2F&state=3c9abb48-9b50-4679-88a2-5d8b4d30ec82&response_mode=fragment&response_type=code&scope=openid&nonce=f40a8b05-859a-440d-ae2e-4f4fa90d3e5e');

  await page.waitForURL('https://qa-spriced-cdbu.alpha.simadvisory.com/**');

  await expect(page).toHaveURL(/qa-spriced-cdbu/);

});
