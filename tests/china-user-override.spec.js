import { test, expect } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
// Use BASE_URL from env or default to dev
const BASE_URL = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';

// Use the working auth base if different from env, or rely on env if updated
const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

test('Eligibility check and Future USD List Price calculation', async ({ page }) => {
  test.setTimeout(120000); // Increased total test timeout
  
  // 1️⃣ Login
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

  // FIX: Increased timeout for input fields
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();

  // 3️⃣ Navigate to Data Explorer
  // Added: Click 'Data Explorer' similar to china-list-pricing.spec.js
  await page.getByText('Data Explorer').click();
  await page.waitForLoadState('networkidle');

  // 2️⃣ Navigate to List Pricing
  await page.getByRole('combobox', { name: /Part/i }).locator('path').click();
  await page.getByRole('option', { name: 'List Pricing' }).locator('span').click();

  // 3️⃣ Apply filters
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  await page.locator('#mat-input-91').fill('TAIWAN-135957 20');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(1000);
  // 4️⃣ Read all required fields
  // const lpFlag = await page.locator('sp-lookup-select', {
  //   has: page.locator('mat-label', { hasText: 'LP Override Flag' }),
  // }).locator('.mat-mdc-select-value-text').first().innerText();
const lpSelect = page.locator('sp-lookup-select', {
  has: page.locator('mat-label', { hasText: 'LP Override Flag' }),
});

// 1️⃣ Ensure the component is visible
await expect(lpSelect).toBeVisible({ timeout: 60000 });

// 2️⃣ Ensure Angular finished rendering the value
await lpSelect.locator('.mat-mdc-select-trigger').waitFor();

// 3️⃣ Safely read the selected value
  const lpFlag = await lpSelect.evaluate(el => {
  const valueEl = el.querySelector('.mat-mdc-select-value-text');
  return valueEl ? valueEl.textContent.trim() : '';
});

  const futureLocal = await page.locator('sp-numeric', {
    has: page.locator('mat-label', { hasText: 'Future Local Currency List Price' }),
  }).locator('input').first().inputValue();

  const calculatedLocalPrice = await page.locator('sp-numeric', {
    has: page.locator('mat-label', { hasText: 'Calculated Local Currency List Price' }),
  }).locator('input').first().inputValue();

  const calculatedUSD = await page.locator('sp-numeric', {
    has: page.locator('mat-label', { hasText: 'Calculated USD List Price' }),
  }).locator('input').first().inputValue();

  const futureUSDLPDate = await page.locator('sp-numeric', {
    has: page.locator('mat-label', { hasText: 'Future USD List Price' }),
  }).locator('input').first().inputValue();

  const dnPricing = await page.locator('sp-input', {
    has: page.locator('mat-label', { hasText: 'DN Pricing Action' }),
  }).locator('input').first().inputValue();

  const pvcPricing = await page.locator('sp-input', {
    has: page.locator('mat-label', { hasText: 'PVC Pricing Action' }),
  }).locator('input').first().inputValue();

  const currentLocal = await page.locator('sp-numeric', {
    has: page.locator('mat-label', { hasText: 'Current Local Currency List Price' }),
  }).locator('input').first().inputValue();

  const region = await page.locator('sp-input', {
    has: page.locator('mat-label', { hasText: 'Region' }),
  }).locator('input').first().inputValue();

  // 5️⃣ Print all values
  console.log('================ Record Details ================');
  console.log('LP Override Flag:', lpFlag?.trim() || 'null');
  console.log('Future Local Currency List Price:', futureLocal || 'null');
  console.log('Calculated Local Currency List Price:', calculatedLocalPrice || 'null');
  console.log('Calculated USD List Price:', calculatedUSD || 'null');
  console.log('Future USD List Price:', futureUSDLPDate || 'null');
  console.log('DN Pricing Action:', dnPricing || 'null');
  console.log('PVC Pricing Action:', pvcPricing || 'null');
  console.log('Current Local Currency List Price:', currentLocal || 'null');
  console.log('Region:', region || 'null');
  console.log('================================================');

  // 6️⃣ Eligibility checks
  const condition1 = lpFlag?.trim() === 'Yes';
  const condition2 = futureLocal && futureLocal.trim() !== '';
  const condition3 = calculatedUSD && calculatedUSD.trim() !== '';
  const conditionDateNull = !futureUSDLPDate || futureUSDLPDate.trim() === '';

  const pricingActions = [dnPricing, pvcPricing, currentLocal];
  const conditionPricingNullOrNone = pricingActions.every(
    val => !val || val.trim().toLowerCase() === 'none'
  );

  const conditionRegionNotChina = region?.trim().toUpperCase() !== 'CHINA';

  console.log('================ Eligibility Checks ================');
  console.log('LP Override = Yes:', condition1 ? 'Yes' : 'No');
  console.log('Future Local Currency List Price not null:', condition2 ? 'Yes' : 'No');
  console.log('Calculated USD List Price not null:', condition3 ? 'Yes' : 'No');
  console.log('Future USD LP Effective Date is null:', conditionDateNull ? 'Yes' : 'No');
  console.log('All Pricing Actions null/None:', conditionPricingNullOrNone ? 'Yes' : 'No');
  console.log('Region != CHINA:', conditionRegionNotChina ? 'Yes' : 'No');
  console.log('====================================================');

  const eligibleForLPUpdate = condition1 && condition2 && condition3;
  const eligibleForDailyPricing =
    conditionDateNull && conditionPricingNullOrNone && conditionRegionNotChina;

  console.log('Eligible for LP Update?', eligibleForLPUpdate ? '✅ Yes' : '❌ No');
  console.log('Eligible for Daily Pricing Action?', eligibleForDailyPricing ? '✅ Yes' : '❌ No');

  // 7️⃣ Future USD List Price Calculation Logic (Final)
  console.log('\n============== Future USD List Price Logic ==============');

  const futureLocalNum = parseFloat(futureLocal) || 0;
  const calculatedLocalNum = parseFloat(calculatedLocalPrice) || 0;
  const calculatedUSDNum = parseFloat(calculatedUSD);
  const existingFutureUSDNum = parseFloat(futureUSDLPDate) || null;
  let futureUSDNum;

  console.log('Future Local (num):', futureLocalNum);
  console.log('Calculated Local (num):', calculatedLocalNum);
  console.log('Calculated USD (num):', calculatedUSDNum);
  console.log('Existing Future USD (num):', existingFutureUSDNum);

  if (!calculatedUSDNum) {
    // Case 1️⃣: Calculated USD List Price is null → retain existing
    futureUSDNum = existingFutureUSDNum;
    console.log('✅ Case 1: Calculated USD List Price is null → Retaining existing:', futureUSDNum);
  } else if (futureLocalNum !== calculatedLocalNum && calculatedLocalNum !== 0) {
    // Case 2️⃣: Recalculate using formula
    futureUSDNum = (futureLocalNum / calculatedLocalNum) * calculatedUSDNum;
    console.log('⚠️ Case 2: Recalculated using (Future Local / Calculated Local) × Calculated USD');
    console.log('Calculated Future USD List Price:', futureUSDNum.toFixed(2));
  } else {
    // Case 3️⃣: Retain existing
    futureUSDNum = existingFutureUSDNum;
    console.log('✅ Case 3: Future Local = Calculated Local → Retaining existing:', futureUSDNum);
  }

  console.log('========================================================');
  console.log('✅ Final Future USD List Price to be used:', futureUSDNum);
  console.log('========================================================');
});