import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // Increase timeout for potentially slow auth redirects
  test.setTimeout(60000);

  await page.goto('https://auth.alpha.simadvisory.com/realms/D_SPRICED/protocol/openid-connect/auth?client_id=CHN_D_SPRICED_Client&redirect_uri=https%3A%2F%2Fqa-spriced-cdbu.alpha.simadvisory.com%2F%3FreturnUrl%3D%252Fspriced-data&state=8a617462-ae4b-4a93-96c5-b71401577aae&response_mode=fragment&response_type=code&scope=openid&nonce=505a27ed-2933-4427-9a57-a64fe92769e3');

  // Wait for the login form to be visible and stable
  await page.waitForSelector('input[name="username"]', { state: 'visible' });

  // Fill credentials directly (removed unnecessary click/press actions)
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty');

  // Click Sign In and wait for navigation to complete
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }), // Wait for the redirect
    page.getByRole('button', { name: 'Sign In' }).click()
  ]);

  // Rest of the script
  await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
  
  const listPricingOption = page.locator('mat-option').filter({ hasText: 'List Pricing' });
  await listPricingOption.click();

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  
  await page.locator('mat-select').filter({ hasText: 'Is equal to' }).click();
  await page.getByText('Contains pattern').click();
  
  const filterInput = page.locator('input.mat-mdc-input-element').last();
  await filterInput.click();
  await filterInput.fill('021313700');
  
  await page.getByRole('button', { name: 'Apply' }).click();

  // Wait for table to load results
  await page.waitForSelector('datatable-body-row');
  
  // Click on the specific cell to expand
  await page.locator('datatable-body-cell').nth(7).click(); 
  
  // Click on the row text if needed
  await page.getByRole('table').getByText('CHINA-').first().click();

  // Interact with dropdown
  // Wait for dropdown to be visible and click it
  const dropdown = page.locator('.mat-mdc-select-arrow.ng-tns-c3393473648-155 > svg');
  await dropdown.waitFor({ state: 'visible' });
  await dropdown.click();
  // FIX: Use a more robust locator for the option and wait for it to appear
  
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  await page.waitFor({ state: 'visible' });
  await page.locator('mat-select').filter({ hasText: 'Is equal to' }).click();
  await page.getByText('Contains pattern').click();
  const option = page.locator('input.mat-mdc-input-element').last();
  await option.click();
  await option.fill('Emergency Change-China');
  await page.getByRole('button', { name: 'Apply' }).click();
  // await option.scrollIntoViewIfNeeded();
  // await option.waitFor({ state: 'visible', timeout: 10000 });
  // await option.click();

  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
});