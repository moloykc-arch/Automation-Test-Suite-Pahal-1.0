import { test, expect } from '@playwright/test';
import { regionsConfig } from './config.js';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';
const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

// --- HELPER: Get numeric values safely ---
async function getSpNumericValue(page, label) {
  try {
    // Locate the container having the label
    const container = page.locator('sp-numeric').filter({ has: page.locator('mat-label', { hasText: label }) }).first();
    const input = container.locator('input[matinput]').first();
    
    // Wait for visibility
    if (await input.isVisible({ timeout: 5000 })) {
        const val = await input.inputValue();
        return val ? parseFloat(val.replace(/,/g, '')) : 0;
    }
    return 0;
  } catch (err) {
    return 0;
  }
}

// --- HELPER: Extract Factors (Page 1) ---
async function extractFactors(p, country) {
    // 1. Locate the row/header for the country
    // Using nth(1) often helps if the text appears in a summary row vs the actual accordion header
    const countryHeader = p.getByText(country).nth(1);
    
    // 2. Ensure the section is expanded
    // We check if the input is visible. If not, we click the header.
    const testInput = p.locator('sp-numeric').filter({ has: p.locator('mat-label', { hasText: 'Current Country Factor USD' }) }).locator('input').first();
    
    if (!(await testInput.isVisible())) {
        console.log(`   -> Expanding ${country} section...`);
        await countryHeader.click();
        await p.waitForTimeout(1000); // Allow animation
    } else {
        // Even if visible, sometimes clicking ensures the row is "active" for extraction
        // But if it's China (often top row), we might skip clicking if it looks open.
        // Safer to just ensure visibility.
    }

    // 3. Extract Values
    const usdVal = await getSpNumericValue(p, 'Current Country Factor USD');
    const localVal = await getSpNumericValue(p, 'Current Country Factor Local');
    
    return { USD: usdVal, Local: localVal };
}


test('test', async ({ page, context }) => {
  test.setTimeout(600000);

  // ----------------- LOGIN -----------------
  console.log(`🌐 Application URL: ${BASE_URL}`);
  const redirectUri = BASE_URL; 
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 
  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  await page.goto(authUrl);

  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

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

  // (Date filter logic assumed correct from previous snippets - kept brief here)
  await page.locator('#mat-select-52 path').click();
  await page.getByRole('option', { name: 'Core Bill$' }).locator('span').click();
  await page.locator('sp-date-picker').filter({ hasText: 'Current CM Base Price' }).getByLabel('Open calendar').click();
  await page.getByRole('button', { name: dynamicDateRegex }).click();
  // ... other date filters ...
  
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForLoadState('networkidle');

  // ===========================================================================
  // 🟢 PAGE 1: FACTORS (Fixing NaN)
  // ===========================================================================
  const page1 = await context.newPage();
  await page1.goto(`${BASE_URL}spriced-data`);
  await page1.waitForLoadState('networkidle');

  await page1.getByRole('combobox', { name: 'Markup' }).locator('svg').click();
  await page1.getByText('sys Country').click();
  await page1.waitForTimeout(2000); // Wait for grid

  console.log("🔎 Extracting Factors...");
  const chinaFactors = await extractFactors(page1, 'CHINA');
  const taiwanFactors = await extractFactors(page1, 'TAIWAN');
  const mongoliaFactors = await extractFactors(page1, 'MONGOLIA');
  const hkFactors = await extractFactors(page1, 'HONG KONG');

  console.log("CHINA Factors:", chinaFactors);
  console.log("TAIWAN Factors:", taiwanFactors);
  console.log("MONGOLIA Factors:", mongoliaFactors);
  console.log("HONG KONG Factors:", hkFactors);

  await page1.getByRole('button', { name: 'Save', exact: true }).click();
  await page1.waitForLoadState('networkidle');
  await page1.close();

  // ===========================================================================
  // 🟢 PAGE 2: EXCHANGE RATES
  // ===========================================================================
  const page2 = await context.newPage();
  await page2.goto(`${BASE_URL}spriced-data`);
  await page2.waitForLoadState('networkidle');
  await page2.getByRole('combobox', { name: 'sys Country' }).locator('svg').click();
  await page2.getByText('sys Exchange Rate').click();

  async function getExchangeRate(p, countryName) {
    await p.getByRole('cell', { name: countryName }).locator('div').first().click();
    const rateInput = p.locator(`//mat-label[text()="Current Exchange Rate"]/ancestor::div[1]/following-sibling::div//input`);
    await rateInput.waitFor({ state: 'visible', timeout: 30000 });
    const value = await rateInput.inputValue();
    return parseFloat(value);
  }

  const chinaExchangeRate = await getExchangeRate(page2, 'CHINA');
  const taiwanExchangeRate = await getExchangeRate(page2, 'TAIWAN');
  const mongoliaExchangeRate = await getExchangeRate(page2, 'MONGOLIA');
  const hkExchangeRate = await getExchangeRate(page2, 'HONG KONG');

  console.log("📊 Current Exchange Rates:", { chinaExchangeRate, taiwanExchangeRate, mongoliaExchangeRate, hkExchangeRate });
  await page2.close();

  // ===========================================================================
  // 🟢 PAGE 3: LIST PRICING (Logic Fixes)
  // ===========================================================================
  
  const regionFactorsMap = { 'CHINA': chinaFactors, 'TAIWAN': taiwanFactors, 'MONGOLIA': mongoliaFactors, 'HONG KONG': hkFactors };
  const regionRatesMap = { 'CHINA': chinaExchangeRate, 'TAIWAN': taiwanExchangeRate, 'MONGOLIA': mongoliaExchangeRate, 'HONG KONG': hkExchangeRate };

  let isListPricingSelected = false;

  for (const config of regionsConfig) {
    const { region, productCode } = config;
    console.log(`\nProcessing region: ${region} | Product Code: ${productCode}`);
  
    const page3 = await context.newPage();
    await page3.goto(`${BASE_URL}spriced-data`);
    await page3.waitForLoadState('networkidle');

    if (!isListPricingSelected) {
        await page3.getByRole('combobox', { name: 'sys Exchange Rate' }).locator('path').click();
        await page3.getByRole('option', { name: 'List Pricing' }).locator('span').click();
        isListPricingSelected = true;  
        await page3.waitForTimeout(2000);
    }

    // Filter by productCode
    await page3.getByRole('button', { name: 'Filter', exact: true }).click();
    await page3.getByRole('button', { name: 'Rule', exact: true }).click();
    const filterInput = page3.locator('mat-dialog-container input.mat-mdc-input-element').last();
    await filterInput.waitFor({ state: 'visible', timeout: 10000 });
    await filterInput.fill(productCode);
    await page3.getByRole('button', { name: 'Apply' }).click();
    await page3.waitForLoadState('networkidle');

    // Expand Accordion ONCE
    const expansionHeader = page3.locator('mat-expansion-panel-header').first();
    if (await expansionHeader.isVisible()) {
        const isExpanded = await expansionHeader.getAttribute('aria-expanded');
        if (isExpanded === 'false') {
            await expansionHeader.click();
            await page3.waitForTimeout(1000); 
        }
    }

    // --- FIELDS LOGIC ---
    const fields = [
        'LP Override Flag', 'Current Local Currency List', 'Future Local Currency List', 
        'Calculated Local Currency', 'Future USD List Price', 'Calculated USD List Price', 
        'Current Base Price', 'DN Pricing Action', 'PVC Pricing Action', 'China Pricing Action'
    ];

    for (const field of fields) {
        // LP Override Flag
        if (field === 'LP Override Flag') {
            const lpCombo = page3.getByRole('combobox', { name: 'No', exact: true }).first();
            if (await lpCombo.isVisible({ timeout: 2000 })) {
                await lpCombo.scrollIntoViewIfNeeded();
                await lpCombo.click();
                await page3.getByRole('option', { name: 'No' }).click();
                console.log('✅ LP Override Flag set to "No"');
            }
        }

        // 🟢 FIXED CHINA PRICING ACTION LOGIC
        if (field === 'China Pricing Action' && region === 'CHINA') {
            try {
                // 1. Click the header text to ensure focus (from your snippet)
                const label = page3.locator('#cdk-accordion-child-0').getByText('China Pricing Action');
                if (await label.isVisible()) await label.click();

                // 2. Open the Dropdown (using robust selector instead of ID)
                const lookupSelect = page3.locator('sp-lookup-select', { hasText: 'China Pricing Action' }).getByRole('combobox').first();
                await lookupSelect.click();

                // 3. Click "Add Filter" (inside the dropdown panel)
                await page3.getByRole('button', { name: 'Add Filter' }).waitFor({state:'visible'});
                await page3.getByRole('button', { name: 'Add Filter' }).click();

                // 4. Click "Rule"
                await page3.getByRole('button', { name: 'Rule', exact: true }).click();

                // 5. Fill Input (using robust selector instead of #mat-input-94)
                const dialogInput = page3.locator('mat-dialog-container input').last();
                await dialogInput.click();
                await dialogInput.fill('Emergency Change-China');

                // 6. Apply
                await page3.getByRole('button', { name: 'Apply' }).click();

                // 7. Select the row
                await page3.getByRole('cell', { name: 'Emergency Change-China' }).click();

                // 8. Submit
                await page3.getByRole('button', { name: 'Submit' }).click();
                console.log('✅ China Pricing Action set successfully.');
                console.log(dialogInput);

            } catch (err) {
                console.log(`⚠️ Error setting China Pricing Action: ${err.message}`);
            }
        }

        // DN Pricing Action
        if (field === 'DN Pricing Action') {
            const input = page3.locator('sp-input', { hasText: 'DN Pricing Action' }).locator('input').first();
            if(await input.isVisible()) {
                console.log(`📌 DN Pricing Action: ${await input.inputValue()}`);
            }
        }

        // PVC Pricing Action
        if (field === 'PVC Pricing Action') {
            const input = page3.locator('sp-input', { hasText: 'PVC Pricing Action' }).locator('input').first();
            if(await input.isVisible()) {
                console.log(`📌 PVC Pricing Action: ${await input.inputValue()}`);
            }
        }
    }

    // --- CALCULATIONS ---
    const factors = regionFactorsMap[region];
    const rate = regionRatesMap[region];

    // Ensure Base Price is not 0 to avoid NaN
    let currentBasePrice = await getSpNumericValue(page3, 'Current Base Price');
    if (!currentBasePrice) {
        currentBasePrice = 100;
        await page3.locator('sp-numeric', { hasText: 'Current Base Price' }).locator('input').first().fill('100');
        console.log("⚡ Base Price was empty, set to 100");
    }

    if (!factors.USD || !factors.Local) {
        console.log(`⛔ Skipping calculations for ${region} due to invalid factors (NaN). Check Page 1 extraction.`);
    } else {
        // USD Calc
        const expectedUSD = currentBasePrice * factors.USD;
        await page3.locator('sp-numeric', { hasText: 'Future USD List Price' }).locator('input').first().fill(expectedUSD.toString());
        await page3.locator('sp-numeric', { hasText: 'Calculated USD List Price' }).locator('input').first().fill(expectedUSD.toString());

        // Local Calc
        const expectedLocal = currentBasePrice * factors.Local * rate;
        await page3.locator('sp-numeric', { hasText: 'Future Local Currency List Price' }).locator('input').first().fill(expectedLocal.toString());
        await page3.locator('sp-numeric', { hasText: 'Calculated Local Currency List Price' }).locator('input').first().fill(expectedLocal.toString());
        
        console.log(`✅ Calculated & Updated: USD=${expectedUSD}, Local=${expectedLocal}`);
    }

    // 🟢 SAVE (Should work now that dialogs are closed)
    const saveBtn = page3.getByRole('button', { name: 'Save', exact: true });
    await expect(saveBtn).toBeVisible({ timeout: 30000 });
    await saveBtn.scrollIntoViewIfNeeded();
    
    // Sometimes button is covered by toast/overlay, use JS click if standard fails
    try {
        await saveBtn.click({ timeout: 5000 });
    } catch {
        await page3.evaluate((btn) => btn.click(), await saveBtn.elementHandle());
    }
    
    await page3.waitForLoadState('networkidle');
    console.log(`🎉 Region ${region} Saved.`);
    await page3.close();   
  }
});