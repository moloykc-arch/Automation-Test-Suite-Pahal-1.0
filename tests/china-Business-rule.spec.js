import { test, expect } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
const BASE_URL = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';
// Use the working auth base if different from env, or rely on env if updated
const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

test.setTimeout(300000); // 5 minutes

test('validate Future Product Group rule', async ({ page }) => {
  console.log('🚀 Starting test: validate Future Product Group rule');
  console.log(`🌐 Base URL: ${BASE_URL}`);

  // ----------------- LOGIN -----------------
  console.log(`🌐 Application URL: ${BASE_URL}`);
  
  // Dynamic Auth URL Construction - Using the working structure provided
  // Redirect URI uses the BASE_URL (e.g. dev or qa root)
  const redirectUri = BASE_URL; 
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 

  // Construct the full URL
  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  console.log(`🔗 Auth Link: ${authUrl}`);

  await page.goto(authUrl);
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=Work with master data and', { timeout: 120000 });

  // ---- 2. Navigate to Filters/Rules ----
  await page.getByText('Work with master data and').click();
  await page.getByText('Model View Explorer Notifications').click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();

  await page.locator('#mat-input-24').fill('T8.17.117-335D');
  await page.getByRole('button', { name: 'Apply' }).click();

  // ---- 3. Select PM Override Flag = Yes ----
  let pmFlag='';
  const pmLookup = page.locator('sp-lookup-select:has(mat-label:text("PM Override Flag"))');
  await pmLookup.waitFor({ state: 'visible', timeout: 120000 });
  await pmLookup.locator('mat-select').click();
  await page.locator('mat-option >> text=Yes').click();
  const selectedFlag = await pmLookup.locator('.mat-mdc-select-value .mat-mdc-select-min-line').innerText().catch(() => '');
  pmFlag=selectedFlag.trim();
  console.log('✅ PM Override Flag:',pmFlag);

  // ---- 4. Read Future Product Group ----
  const futureLookup = page.locator('sp-lookup-select:has(mat-label:text("Future Product Group"))');
  await futureLookup.waitFor({ state: 'visible', timeout: 120000 });

  let futureGroup = '';
  const futureDropdown = futureLookup.locator('mat-select');
  const isDropdownVisible = await futureDropdown.isVisible();

  if (isDropdownVisible) {
    await futureDropdown.click();
    const selectedText = await futureDropdown.locator('.mat-mdc-select-value .mat-mdc-select-min-line').innerText().catch(() => '');
    futureGroup = selectedText.trim();
    // Only press Escape if dropdown opened
    await page.keyboard.press('Escape').catch(() => {});
  }

    console.log(`Future Product Group: "${futureGroup}"`);

  // ---- 5. Read System Recommended Product Group ----
const systemGroupInput = page.locator('sp-input:has(mat-label:text("System Recommended Product Group")) input');
await systemGroupInput.scrollIntoViewIfNeeded();

// force read value even if hidden
const systemGroup = await systemGroupInput.evaluate(input => input.value.trim());
 console.log(`System Recommended Product Group: "${systemGroup}"`);


  // ---- 6. Logic validation ----
  if (futureGroup === systemGroup) {
    console.log('❌ Test Failed: Future Product Group should NOT equal System Recommended Product Group');
    expect(false, 'Future Product Group equals System Recommended Product Group').toBeTruthy();
  } else {
    console.log('✅ Test Passed: If PM Override Flag equals to Yes AND Future PG equals to System Recommended PG AND Future PG not null THEN Future PG is not valid');
  }

  // ---- 7. Submit and Save ----
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  console.log('🏁 Test completed successfully');
});