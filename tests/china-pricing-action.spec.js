import { test, expect } from '@playwright/test';
import { regionsConfig } from './config.js';
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

// --- Helper: Expand accordion section ---
async function expandSection(page, sectionTitle) {
  const section = page.locator(`text=${sectionTitle}`).first();
  if (await section.isVisible()) {
    await section.scrollIntoViewIfNeeded();
    await section.click();
  }
}

// --- Helper: Get input value safely ---
async function getInputValue(page, label, sectionTitle = null) {
  try {
    if (sectionTitle) await expandSection(page, sectionTitle);
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toBeVisible({ timeout: 15000 });
    const value = await input.inputValue();
    return parseFloat(value);
  } catch (err) {
    console.error(`Failed to get value for "${label}": ${err.message}`);
    return NaN;
  }
}

// --- Helper: Select mat-dropdown option by label ---
async function selectDropdownByLabel(page, label, optionText) {
  const field = page.locator('mat-form-field').filter({
    has: page.locator('label', { hasText: label })
  });
  const trigger = field.locator('.mat-mdc-select-trigger');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const option = page.locator('cdk-overlay-container mat-option').filter({ hasText: optionText });
  await option.click();
  await page.waitForTimeout(500);
}

// Helper to get value from sp-numeric field by its label
async function getLocalCurrencyUIValue(page, label) {
  try {
    // 1️⃣ Find sp-numeric container with the label
    const container = page.locator('sp-numeric').filter({
      has: page.locator('mat-label', { hasText: label })
    }).first();

    // 2️⃣ Find the input inside it
    const input = container.locator('input[matinput]').first();

    // 3️⃣ Wait until the input is visible
    await input.waitFor({ state: 'visible', timeout: 15000 });

    // 4️⃣ Get its value
    const value = await input.inputValue();
    return value ? parseFloat(value.replace(/,/g, '')) : null;
  } catch (err) {
    console.error(`Failed to get value for "${label}":`, err);
    return null;
  }
}

async function getValueFromSpNumeric(page, label) {
  try {
    const container = page.locator('sp-numeric', { hasText: label }).first();
    const input = container.locator('input').first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    const value = await input.inputValue();
    return parseFloat(value.replace(/,/g, '')); // remove commas
  } catch (err) {
    console.error(`Failed to get value for "${label}":`, err);
    return NaN;
  }
}

async function getFutureUSDListPrice(page) {
  try {
    // 1️⃣ Find the sp-numeric container that has the label
    const container = page.locator('sp-numeric', { hasText: 'Future USD List Price' }).first();

    // 2️⃣ Find the input inside this container
    const input = container.locator('input').first();

    // 3️⃣ Wait for the input to be visible
    await expect(input).toBeVisible({ timeout: 30000 });

    // 4️⃣ Get the value
    const value = await input.inputValue();
    return parseFloat(value.replace(/,/g, '')); // remove commas if any
  } catch (err) {
    console.error('Failed to get Future USD List Price:', err);
    return NaN;
  }
}

// -----------------------------------------------------------------------------
// Helper: get value from <sp-numeric> by label
async function getSpNumericValue(page, label) {
  try {
    const container = page.locator('sp-numeric', { hasText: label }).first();
    const input = container.locator('input[matinput]').first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    const value = await input.inputValue();
    return value ? parseFloat(value.replace(/,/g, '')) : null;
  } catch (err) {
    console.error(`Failed to get value for "${label}":`, err);
    return null;
  }
}

async function getLocalCurrencyValue(page, label) {
  try {
    // Find the sp-numeric container with the label
    const container = page.locator('sp-numeric', { hasText: label }).first();
    const input = container.locator('input').first();
    await expect(input).toBeVisible({ timeout: 30000 });
    const value = await input.inputValue();
    return parseFloat(value.replace(/,/g, '')); // remove commas if any
  } catch (err) {
    console.error(`Failed to get value for "${label}":`, err);
    return NaN;
  }
}

test('test', async ({ page, context }) => {
  test.setTimeout(600000);

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

  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for navigation after login
  await page.waitForLoadState('networkidle');

  // await page.screenshot({ path: 'screenshot.png', fullPage: true });

  // ----------------- Navigate to Data Explorer -----------------
  await page.getByText('Data Explorer').click();
  await page.waitForLoadState('networkidle');

  // ----------------- Select Markup -----------------
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const dynamicDateRegex = new RegExp(dateString);
  await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
  await page.getByText('Markup').click();

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();

  await page.locator('mat-dialog-container input.mat-mdc-input-element').last().click();
  await page.locator('mat-dialog-container input.mat-mdc-input-element').last().fill('91');

  await page.getByRole('button', { name: 'Apply' }).click();

  // Set Date Filters
  await page.locator('#mat-select-52 path').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Current CM Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-54 svg').click();
  await page.getByRole('option', { name: 'Core Bill$' }).click();

  await page.locator('sp-date-picker').filter({ hasText: 'Future CM Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-56 svg').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Current HK Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-58 svg').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Future HK Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-60 svg').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Current MG Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-62 path').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Future MG Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-64 path').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Current TW Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.locator('#mat-select-66 svg').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();

  await page.locator('sp-date-picker').filter({ hasText: 'Future TW Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  
  // Wait for save operation to complete
  await page.waitForLoadState('networkidle');

    // ----------------- Page1: sys Country -----------------
  const page1 = await context.newPage();
  await page1.goto(`${BASE_URL}spriced-data`);
  await page1.waitForLoadState('networkidle');

  await page1.getByRole('combobox', { name: 'Markup' }).locator('svg').click();
  await page1.getByText('sys Country').click();
  
  // USD input locator using sp-numeric
const chinaFactorUSDLocator = page1.locator(
  '//sp-numeric[.//mat-label[text()="Current Country Factor USD"]]//input'
);

// Wait until visible
await chinaFactorUSDLocator.waitFor({ state: 'visible', timeout: 60000 });

// Get element handle
const usdInputHandle = await chinaFactorUSDLocator.elementHandle();

// Wait until the input has a non-empty value
await page1.waitForFunction(
  (el) => el.value !== '',
  usdInputHandle
);

const chinaFactorUSD = parseFloat(await chinaFactorUSDLocator.inputValue());
console.log("CHINA Factor USD:", chinaFactorUSD);

// Local input locator
const chinaFactorLocalLocator = page1.locator(
  '//sp-numeric[.//mat-label[text()="Current Country Factor Local"]]//input'
);
await chinaFactorLocalLocator.waitFor({ state: 'visible', timeout: 60000 });
const localInputHandle = await chinaFactorLocalLocator.elementHandle();

await page1.waitForFunction(
  (el) => el.value !== '',
  localInputHandle
);

const chinaFactorLocal = parseFloat(await chinaFactorLocalLocator.inputValue());
console.log("CHINA Factor Local:", chinaFactorLocal);


  await page1.getByText('TAIWAN').nth(1).click();
  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor USD', { exact: true }).click();
  await page1.locator('#mat-input-59').click();

  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor Local', { exact: true }).click();
  await page1.locator('#mat-input-63').click();

  // USD input for TAIWAN
const taiwanFactorUSDLocator = page1.locator('//mat-label[text()="Current Country Factor USD"]/ancestor::div[1]/following-sibling::div//input[1]');
await taiwanFactorUSDLocator.waitFor({ state: 'visible', timeout: 60000 });
const taiwanFactorUSD = parseFloat(await taiwanFactorUSDLocator.inputValue());
console.log("TAIWAN Factor USD:", taiwanFactorUSD);

// Local input for TAIWAN
const taiwanFactorLocalLocator = page1.locator('//mat-label[text()="Current Country Factor Local"]/ancestor::div[1]/following-sibling::div//input[1]');
await taiwanFactorLocalLocator.waitFor({ state: 'visible', timeout: 60000 });
const taiwanFactorLocal = parseFloat(await taiwanFactorLocalLocator.inputValue());
console.log("TAIWAN Factor Local:", taiwanFactorLocal);



  await page1.getByText('MONGOLIA').nth(1).click();
  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor USD', { exact: true }).click();
  await page1.locator('#mat-input-59').click();

  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor Local', { exact: true }).click();
  await page1.locator('#mat-input-63').click();

  // Click to expand Mongolia section
await page1.getByText('MONGOLIA').nth(1).click();
await page1.waitForLoadState('networkidle');

// USD input
const mongoliaFactorUSDLocator = page1.locator('//mat-label[text()="Current Country Factor USD"]/following::input[1]');
await mongoliaFactorUSDLocator.waitFor({ state: 'visible', timeout: 60000 });
const mongoliaFactorUSD = parseFloat(await mongoliaFactorUSDLocator.inputValue());
console.log("MONGOLIA Factor USD:", mongoliaFactorUSD);

// Local input
const mongoliaFactorLocalLocator = page1.locator('//mat-label[text()="Current Country Factor Local"]/following::input[1]');
await mongoliaFactorLocalLocator.waitFor({ state: 'visible', timeout: 60000 });
const mongoliaFactorLocal = parseFloat(await mongoliaFactorLocalLocator.inputValue());
console.log("MONGOLIA Factor Local:", mongoliaFactorLocal);


  await page1.getByText('HONG KONG').nth(1).click();
  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor USD', { exact: true }).click();
  await page1.locator('#mat-input-59').click();

  await page1.locator('#cdk-accordion-child-0').getByText('Current Country Factor Local', { exact: true }).click();
  await page1.locator('#mat-input-63').click();

 // Click to expand Hong Kong section
await page1.getByText('HONG KONG').nth(1).click();
await page1.waitForLoadState('networkidle');

// USD input
const hkFactorUSDLocator = page1.locator('//mat-label[text()="Current Country Factor USD"]/following::input[1]');
await hkFactorUSDLocator.waitFor({ state: 'visible', timeout: 60000 });
const hkFactorUSD = parseFloat(await hkFactorUSDLocator.inputValue());
console.log("HONG KONG Factor USD:", hkFactorUSD);

// Local input
const hkFactorLocalLocator = page1.locator('//mat-label[text()="Current Country Factor Local"]/following::input[1]');
await hkFactorLocalLocator.waitFor({ state: 'visible', timeout: 60000 });
const hkFactorLocal = parseFloat(await hkFactorLocalLocator.inputValue());
console.log("HONG KONG Factor Local:", hkFactorLocal);


  await page1.getByRole('button', { name: 'Save', exact: true }).click();
  await page1.waitForLoadState('networkidle');


  // ----------------- Page2: sys Exchange Rate -----------------
  // --- Open Page2: sys Exchange Rate ---
const page2 = await context.newPage();
await page2.goto(`${BASE_URL}spriced-data`);
await page2.waitForLoadState('networkidle');

// Click on the dropdown to select sys Exchange Rate
await page2.getByRole('combobox', { name: 'sys Country' }).locator('svg').click();
await page2.getByText('sys Exchange Rate').click();

// Helper function to get exchange rate for a country
async function getExchangeRate(page, countryName) {
  // Click the country row
  await page.getByRole('cell', { name: countryName }).locator('div').first().click();

  // Wait for the "Current Exchange Rate" label to be visible
  const rateInput = page.locator(`//mat-label[text()="Current Exchange Rate"]/ancestor::div[1]/following-sibling::div//input`);
  await rateInput.waitFor({ state: 'visible', timeout: 30000 });

  // Get the input value
  const value = await rateInput.inputValue();
  return parseFloat(value);
}

// Extract values for all 4 regions
const chinaExchangeRate = await getExchangeRate(page2, 'CHINA');
const taiwanExchangeRate = await getExchangeRate(page2, 'TAIWAN');
const mongoliaExchangeRate = await getExchangeRate(page2, 'MONGOLIA');
const hkExchangeRate = await getExchangeRate(page2, 'HONG KONG');

console.log("📊 Current Exchange Rates:");
console.log("CHINA:", chinaExchangeRate);
console.log("TAIWAN:", taiwanExchangeRate);
console.log("MONGOLIA:", mongoliaExchangeRate);
console.log("HONG KONG:", hkExchangeRate);


  // ----------------- Page3: List Pricing -----------------

  let isListPricingSelected = false;

   for (const config of regionsConfig) {
  const { region, productCode } = config;
  console.log(`\nProcessing region: ${region} with Product Code: ${productCode}`);

  
  const page3 = await context.newPage();
await page3.goto(`${BASE_URL}spriced-data`);
await page3.waitForLoadState('networkidle');

if (!isListPricingSelected) {
      await page3.getByRole('combobox', { name: 'sys Exchange Rate' }).locator('path').click();
      await page3.getByRole('option', { name: 'List Pricing' }).locator('span').click();
      isListPricingSelected = true;  // mark as selected
}

// Filter by productCode
await page3.getByRole('button', { name: 'Filter', exact: true }).click();
await page3.getByRole('button', { name: 'Rule', exact: true }).click();

const filterInput = page3.locator('mat-dialog-container input.mat-mdc-input-element').last();
    await filterInput.waitFor({ state: 'visible', timeout: 10000 });
    await filterInput.fill(productCode);

await page3.getByRole('button', { name: 'Apply' }).click();
await page3.waitForLoadState('networkidle');

console.log(`Processing region: ${region}`);

// --- Fields to update ---
  const fields = [
    'LP Override Flag',
    'Current Local Currency List',
    'Future Local Currency List',
    'Calculated Local Currency',
    'Future USD List Price',
    'Calculated USD List Price',
    'Current Base Price',
    'DN Pricing Action',
    'PVC Pricing Action',
    'China Pricing Action'
  ];


for (const field of fields) {
  // Expand accordion section if needed
  const section = page3.locator('#cdk-accordion-child-0')
                       .getByText('Current Local Currency List Price', { exact: true })
                       .first();
  await section.scrollIntoViewIfNeeded();
  await section.click();

  if (field === 'LP Override Flag') {
    const lpCombo = page3.getByRole('combobox', { name: 'No', exact: true }).first();
    if (await lpCombo.isVisible({ timeout: 120000 })) {
      await lpCombo.scrollIntoViewIfNeeded();
      await lpCombo.click();
      await page3.getByRole('option', { name: 'No' }).click();
      console.log('✅ LP Override Flag set to "No"');
    } else {
      console.log('⚠️ LP Override Flag combobox not visible');
    }
  }

  if (field === 'China Pricing Action') {
    try {
      const container = page3.locator('sp-lookup-select', { has: page3.locator('mat-label', { hasText: 'China Pricing Action' }) }).first();
      await container.scrollIntoViewIfNeeded();
      const matSelect = container.locator('mat-select').first();
      await matSelect.waitFor({ state: 'visible', timeout: 15000 });
      await matSelect.click();
      const option = page3.locator('mat-option', { hasText: 'Emergency Change-China' }).first();
      await option.waitFor({ state: 'visible', timeout: 10000 });
      await option.click();
      console.log('✅ China Pricing Action updated to "Emergency Change-China"');
    } catch {
      console.log('⚠️ China Pricing Action combobox not visible');
    }
  }
     // 🎯 UPDATED LOGIC FOR CHINA PRICING ACTION
      // if (field === 'China Pricing Action') {
      //   try {
      //     const container = page3.locator('sp-lookup-select', { has: page3.locator('mat-label', { hasText: 'China Pricing Action' }) }).first();
      //     await container.scrollIntoViewIfNeeded();
      //     const matSelect = container.locator('mat-select').first();
      //     await matSelect.waitFor({ state: 'visible', timeout: 15000 });
      //     await matSelect.click();
          
      //     // Click Filter inside the dropdown
      //     await page3.getByRole('button', { name: 'Filter', exact: true }).click();
      //     await page3.getByRole('button', { name: 'Rule', exact: true }).click();
      
      //     // FIX: Use a more stable locator for the filter input in dialog
      //     const firstPageFilterInput = page3.locator('mat-dialog-container input.mat-mdc-input-element').last();
      //     await expect(firstPageFilterInput).toBeVisible({ timeout: 10000 });
      //     // await firstPageFilterInput.fill('G6540602'); // Uncomment/modify if specific search needed
      //     await container.scrollIntoViewIfNeeded();

      //     const option = page3.locator('mat-option', { hasText: 'Emergency Change-China' }).first();
      //     await option.waitFor({ state: 'visible', timeout: 10000 });
      //     await option.click();
      //     console.log('✅ China Pricing Action updated to "Emergency Change-China"');
      //   } catch (err) {
      //     console.log('⚠️ China Pricing Action combobox not visible or error:', err);
      //   }
      // }


  if (field === 'DN Pricing Action') {
    try {
      const container = page3.locator('sp-input', { has: page3.locator('mat-label', { hasText: 'DN Pricing Action' }) }).first();
      await container.scrollIntoViewIfNeeded();
      const input = container.locator('input[matinput]').first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      const value = await input.inputValue();
      console.log(`📌 DN Pricing Action current value: ${value || 'null/empty'}`);
    } catch {
      console.log('⚠️ DN Pricing Action input not visible');
    }
  }

  if (field === 'PVC Pricing Action') {
    try {
      const container = page3.locator('sp-input', { has: page3.locator('mat-label', { hasText: 'PVC Pricing Action' }) }).first();
      await container.scrollIntoViewIfNeeded();
      const input = container.locator('input[matinput]').first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      const value = await input.inputValue();
      console.log(`📌 PVC Pricing Action current value: ${value || 'null/empty'}`);
    } catch {
      console.log('⚠️ PVC Pricing Action input not visible');
    }
  }
}

  // 2️⃣ Locate the <sp-numeric> wrapper containing the label
const spNumeric = page3.locator('sp-numeric', { has: page3.locator('mat-label:text("Current Local Currency List Price")') });

// 3️⃣ Wait for the input inside it to appear
const inputField = spNumeric.locator('input[matinput]');
await inputField.waitFor({ state: 'visible', timeout: 5000 });

// 4️⃣ Get the input value
const fieldValue = await inputField.inputValue();

// 5️⃣ Check if it's empty/null
if (!fieldValue) {
    console.log('✅ Current Local Currency List Price is empty/null');
} else {
    console.log('❌ Current Local Currency List Price has value:', fieldValue);
}

// Usage
const futureUSD = await getFutureUSDListPrice(page3);
console.log('Future USD List Price:', futureUSD);

// --------------------------------------------------------------------------------------------
const regionFactors = {
  CHINA: { USD: chinaFactorUSD, Local: chinaFactorLocal },
  TAIWAN: { USD: taiwanFactorUSD, Local: taiwanFactorLocal },
  MONGOLIA: { USD: mongoliaFactorUSD, Local: mongoliaFactorLocal },
  'HONG KONG': { USD: hkFactorUSD, Local: hkFactorLocal }
};

const regionExchangeRates = {
  CHINA: chinaExchangeRate,
  TAIWAN: taiwanExchangeRate,
  MONGOLIA: mongoliaExchangeRate,
  'HONG KONG': hkExchangeRate
};

const currentCountryFactorUSD = regionFactors[region].USD;
const currentCountryFactorLocal = regionFactors[region].Local;
const currentExchangeRate = regionExchangeRates[region];

// 1️⃣ Get all three base prices
let futureBasePrice = await getSpNumericValue(page3, 'Future Base Price');
let publishBasePrice = await getSpNumericValue(page3, 'Publish Base Price');
let currentBasePrice = await getSpNumericValue(page3, 'Current Base Price');

// 2️⃣ Only update Current Base Price if null/0
if (!currentBasePrice || currentBasePrice === 0) {
  currentBasePrice = 100;
  const currentBaseInput = page3
    .locator('sp-numeric', { hasText: 'Current Base Price' })
    .locator('input[matinput]')
    .first();

  await currentBaseInput.fill(currentBasePrice.toString());
  console.log(`⚡ Current Base Price was null/0. Added 100 and saved: ${currentBasePrice}`);
} else {
  console.log(`✅ Current Base Price already has value: ${currentBasePrice}`);
}

// 3️⃣ Calculate USD List Price
const expectedCalculatedUSD = currentBasePrice * currentCountryFactorUSD;
console.log(`🧮 Expected Calculated USD List Price: ${currentBasePrice} * ${currentCountryFactorUSD} = ${expectedCalculatedUSD}`);

// 4️⃣ Fill both Future USD List Price and Calculated USD List Price fields in the UI
try {
  const futureUSDInput = page3
    .locator('sp-numeric', { hasText: 'Future USD List Price' })
    .locator('input[matinput]')
    .first();
  await futureUSDInput.fill(expectedCalculatedUSD.toString());
  console.log(`💾 Future USD List Price updated to: ${expectedCalculatedUSD}`);

  const calculatedUSDInput = page3
    .locator('sp-numeric', { hasText: 'Calculated USD List Price' })
    .locator('input[matinput]')
    .first();
  await calculatedUSDInput.fill(expectedCalculatedUSD.toString());
  console.log(`💾 Calculated USD List Price updated to: ${expectedCalculatedUSD}`);
} catch (err) {
  console.error('⚠️ Failed to update USD List Price fields:', err);
}

// 5️⃣ Display extracted values for verification
console.log('📊 Extracted Values from UI:');
console.log('Future Base Price:', futureBasePrice);
console.log('Publish Base Price:', publishBasePrice);
console.log('Current Base Price:', currentBasePrice);

// 6️⃣ Extract updated UI values to verify PASS/FAIL
const actualCalculatedUSD = await getSpNumericValue(page3, 'Calculated USD List Price');
const actualFutureUSD = await getSpNumericValue(page3, 'Future USD List Price');

console.log('📊 Extracted Calculated USD List Price from UI:', actualCalculatedUSD);
console.log('📊 Extracted Future USD List Price from UI:', actualFutureUSD);

// 7️⃣ Compare and print test result
if (actualCalculatedUSD === expectedCalculatedUSD && actualFutureUSD === expectedCalculatedUSD) {
  console.log('✅ Both USD List Prices match expected value. PASS');
} else {
  console.log('❌ USD List Price mismatch. FAIL');
}

// 2️⃣ Use COALESCE logic: take the first non-null/non-zero value
const basePriceForLocal = futureBasePrice ?? publishBasePrice ?? currentBasePrice ?? 0;

// 3️⃣ Calculate the expected Calculated Local Currency List Price
const expectedCalculatedLocal = basePriceForLocal * currentCountryFactorLocal * currentExchangeRate;

// 4️⃣ Display for verification
console.log('📊 Base Price used for Local Currency calculation:', basePriceForLocal);
console.log(`🧮 Expected Calculated Local Currency List Price: ${basePriceForLocal} * ${currentCountryFactorLocal} * ${currentExchangeRate} = ${expectedCalculatedLocal}`);

// 1️⃣ Find column index from headers
const headers = page3.locator('datatable-header-cell');
const headerCount = await headers.count();
let columnIndex = -1;
for (let i = 0; i < headerCount; i++) {
  const title = await headers.nth(i).getAttribute('title');
  if (title === 'Current Base Price') {
    columnIndex = i;
    break;
  }
}

// Extract values first
const actualCalculatedLocal = await getLocalCurrencyValue(page3, 'Calculated Local Currency List Price');
const actualFutureLocal = await getLocalCurrencyValue(page3, 'Future Local Currency List Price');

// After updating USD values
await page3.waitForTimeout(2000); // small delay for backend recalculation

// OR wait until the Local Currency field has a non-null value
await page3.waitForFunction(
  async () => {
    const calcField = document.querySelector('sp-numeric input#mat-input-85'); // your field id
    return calcField && calcField.value && !isNaN(parseFloat(calcField.value));
  },
  { timeout: 15000 }
);


// 4️⃣ Fill both Local Currency fields in the UI
try {
  const calculatedLocalInput = page3
    .locator('sp-numeric', { hasText: 'Calculated Local Currency List Price' })
    .locator('input[matinput]')
    .first();
  await calculatedLocalInput.fill(expectedCalculatedLocal.toString());
  console.log(`💾 Calculated Local Currency List Price updated to: ${expectedCalculatedLocal}`);

  const futureLocalInput = page3
    .locator('sp-numeric', { hasText: 'Future Local Currency List Price' })
    .locator('input[matinput]')
    .first();
  await futureLocalInput.fill(expectedCalculatedLocal.toString());
  console.log(`💾 Future Local Currency List Price updated to: ${expectedCalculatedLocal}`);
} catch (err) {
  console.error('⚠️ Failed to update Local Currency List Price fields:', err);
}

const uiCalculatedLocal = await getLocalCurrencyUIValue(page3, 'Calculated Local Currency List Price');
const uiFutureLocal = await getLocalCurrencyUIValue(page3, 'Future Local Currency List Price');

console.log('📊 Extracted Values from UI:');
console.log('Calculated Local Currency List Price:', uiCalculatedLocal);
console.log('Future Local Currency List Price:', uiFutureLocal);

if (uiCalculatedLocal == null || uiFutureLocal == null || isNaN(uiCalculatedLocal) || isNaN(uiFutureLocal)) {
  console.log('⚠️ One or both Local Currency List Price values are missing or invalid.');
} else if (Math.abs(uiCalculatedLocal - expectedCalculatedLocal) < 0.01) {
  console.log('✅ Calculated Local Currency List Price matches expected value. PASS');
} else {
  console.log(`❌ Mismatch: UI = ${uiCalculatedLocal}, Expected = ${expectedCalculatedLocal}. FAIL`);
}

// ---------------------------------------------------------------------------------------------------------
const saveBtn = page3.getByRole('button', { name: 'Save', exact: true });

// Wait until it's visible AND enabled
await expect(saveBtn).toBeVisible({ timeout: 60000 });
await expect(saveBtn).toBeEnabled({ timeout: 60000 });

// Scroll into view
await saveBtn.scrollIntoViewIfNeeded();

// Force click via JavaScript (bypasses overlay issues)
await page3.evaluate((btn) => btn.click(), await saveBtn.elementHandle());

// OR fallback with normal click if above works
// await saveBtn.click();

// Wait for network idle after save
await page3.waitForLoadState('networkidle');

await page3.close();   
} 

});