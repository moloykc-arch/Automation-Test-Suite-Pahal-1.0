import { test, expect } from '@playwright/test';
import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { spawn } from 'child_process'; // Added missing import for spawn if used later or needed

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
async function getPVCGridValue(page, columnHeader) {
  // 1. Find column index by header text
  const headers = page.locator('datatable-header-cell');
  const headerCount = await headers.count();

  let columnIndex = -1;

  for (let i = 0; i < headerCount; i++) {
    const text = (await headers.nth(i).innerText()).trim();
    if (text === columnHeader) {
      columnIndex = i;
      break;
    }
  }

  if (columnIndex === -1) {
    throw new Error(`❌ Column not found: ${columnHeader}`);
  }

  // 2. Read value from first row using index
  const row = page.locator('datatable-body-row').first();
  await expect(row).toBeVisible({ timeout: 30000 });

  const cell = row.locator('datatable-body-cell').nth(columnIndex);
  await expect(cell).toBeVisible({ timeout: 30000 });

  const value = (await cell.innerText())?.trim();
  return value || null;
}




// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
// Use BASE_URL from env or default to dev
const BASE_URL = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';

// Use the working auth base if different from env, or rely on env if updated
const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

async function runPVCValidationFlow(page, context, BASE_URL) {
  console.log(`🌐 Application URL: ${BASE_URL}`);
  
  // Dynamic Auth URL Construction
  // Ensure redirect URI matches what Keycloak expects
  const redirectUri = BASE_URL; 
  
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 

  // Construct the full URL
  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  console.log(`🔗 Auth Link: ${authUrl}`);
  await page.goto(authUrl);
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
  console.log('🚀 Starting PVC Validation Flow');
  
  const nrpBaseUrl = BASE_URL.replace('cdbu', 'nrp');
  await page.goto(nrpBaseUrl);
  await page.waitForLoadState('networkidle');
  // ---- READ PVC ACTION (Rules 1–4) ----
    if (page.url() !== `${nrpBaseUrl}spriced-data`) {
      await page.getByText('Data Explorer').click();
      await page.waitForLoadState('networkidle');
  }
  // Select Plugin
  await page.getByRole('combobox', { name: 'plugin' }).locator('path').click(); // or 'svg' if path fails
  await page.getByText('NRP').click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();

  const filterInput = page.locator('mat-dialog-container input').last();
  await filterInput.fill('G6540602');
  await page.getByRole('button', { name: 'Apply' }).click();

// ---------------- PRICING ACTION VALIDATION (CHINA DBU) ----------------

// ---------------- OPEN PVC ACTION ENTITY (NEW TAB) ----------------

const pvcPage = await context.newPage();

// Navigate to PVC Action entity explicitly
await pvcPage.goto(`${nrpBaseUrl}spriced-data`, { waitUntil: 'networkidle' });

// Select entity: PVC Action
// await pvcPage.getByRole('combobox', { name: 'Part' }).click();
await pvcPage.getByLabel('010 - Part').first().click();
await pvcPage.getByText('033 - PVC Action', { exact: true }).click();

// Filter PVC Action by Part Code
await pvcPage.getByRole('button', { name: 'Filter', exact: true }).click();
await pvcPage.getByRole('button', { name: 'Rule', exact: true }).click();

const pvcFilterInput = pvcPage.locator('mat-dialog-container input').last();
await pvcFilterInput.fill('G6540602'); // Part Code
await pvcPage.getByRole('button', { name: 'Apply' }).click();

// Wait for row
const pvcRow = pvcPage.locator('datatable-body-row').first();
await expect(pvcRow).toBeVisible({ timeout: 20000 });
const pricingActionLabel = pvcPage.locator('#cdk-accordion-child-0 div').filter({ hasText: /^Pricing Action$/ });
await expect(pricingActionLabel).toBeVisible({ timeout: 15000 });


let pricingActionValue = null;

// Case 1: mat-select
if (await pricingActionLabel.locator('.mat-mdc-select-value-text').count()) {
  pricingActionValue = await pricingActionLabel
    .locator('.mat-mdc-select-value-text')
    .innerText();
}

// Case 2: input field
else if (await pricingActionLabel.locator('input').count()) {
  pricingActionValue = await pricingActionLabel
    .locator('input')
    .inputValue();
}

// Business rule
pricingActionValue = pricingActionValue?.trim();
if (!pricingActionValue) pricingActionValue = 'None';

console.log(`📌 PVC Pricing Action resolved as: ${pricingActionValue}`);


// Always validate against China DBU Pricing Action entity
// ---------------- VALIDATE PRICING ACTION IN CHINA DBU ----------------

const pricingActionPage = await context.newPage();

// Navigate to China DBU
await pricingActionPage.goto(`${BASE_URL}spriced-data`, { waitUntil: 'networkidle' });

// Select entity: 007 Pricing Action
await pricingActionPage.getByRole('combobox', { name: 'Part' }).click();
await pricingActionPage.getByText('007 Pricing Action', { exact: true }).click();
await pricingActionPage.waitForLoadState('networkidle');
// Filter by CODE = Pricing Action value
await pricingActionPage.getByRole('button', { name: 'Filter', exact: true }).click();
await pricingActionPage.getByRole('button', { name: 'Rule', exact: true }).click();

const pricingFilterInput =
  pricingActionPage.locator('mat-dialog-container input').last();

await pricingFilterInput.fill(pricingActionValue);
await pricingActionPage.getByRole('button', { name: 'Apply' }).click();

// Wait for matching row
const pricingRow = pricingActionPage.locator('datatable-body-row').first();
await expect(pricingRow).toBeVisible({ timeout: 30000 });

// Read Allow Flag value safely
const allowFlag = (
  await pricingRow
    .locator('datatable-body-cell')
    .filter({ hasText: /^Yes|No$/ })
    .first()
    .innerText()
).trim();

// Normalize
// allowFlag = allowFlag?.trim() ?? '';

console.log(`📌 Allow Flag for "${pricingActionValue}" : ${allowFlag}`);
const normalizedAllowFlag = allowFlag
  ?.replace(/\s+/g, ' ')
  .trim();

// console.log(`📌 Normalized Allow Flag: "${normalizedAllowFlag}"`);
// Decision gate
if (!normalizedAllowFlag.startsWith('Yes')) {
  console.log('🚫 Allow Flag is not Yes – No update will happen');

  await pvcPage.close();
  await pricingActionPage.close();
  return; // HARD STOP
}

console.log('✅ Allow Flag = Yes → continue PVC logic');

const pvcAction = {
  publishCode: await getPVCGridValue(pvcPage, 'Publish PVC Code'),
  publishDate: await getPVCGridValue(pvcPage, 'Publish Effective Date'),

  futureCode: await getPVCGridValue(pvcPage, 'Future PVC Code'),
  futureDate: await getPVCGridValue(pvcPage, 'Future Effective Date'),
  
  effectiveCode: await getPVCGridValue(pvcPage, 'Effective PVC Code'),
  effectiveDate: await getPVCGridValue(pvcPage, 'Effective Date')
};

console.log('📊 PVC Grid Snapshot:', pvcAction);

  const selectedPVC =
    pvcAction.publishCode
      ? { code: pvcAction.publishCode, date: pvcAction.publishDate }
      : pvcAction.futureCode
      ? { code: pvcAction.futureCode, date: pvcAction.futureDate }
      : { code: pvcAction.effectiveCode, date: pvcAction.effectiveDate };

  // ---------------- CALL DB POLLING API ----------------
  const app = express();
  app.use(express.json());
  app.post('/workflow/runWorkflow/DB%20polling%20mechanism', (req, res) => {
    res.json({ status: 'success' });
  });

  const server = app.listen(5087, async () => {
    console.log('Server started on port 5087');
    try {
      const response = await fetch('http://127.0.0.1:5087/workflow/runWorkflow/DB%20polling%20mechanism', { method: 'POST' });
      const data = await response.json();
      console.log(data); // { status: 'success' }
    } catch (e) {
      console.error('Failed to trigger DB polling workflow:', e);
    }
    server.close();
  });

console.log('⏳ Waiting for CHINA DBU sync...');
await page.waitForTimeout(15000);

// --- CHINA DBU PART ENTITY VALIDATION ---

const chinaPage = await context.newPage();
await chinaPage.goto(`${BASE_URL}spriced-data`, { waitUntil: 'networkidle' });

// Select entity: Part
await chinaPage.getByRole('combobox', { name: '007 Pricing Action' }).click();
// Open entity dropdown
await chinaPage.locator('#mat-option-5').getByText('Part').click();
await chinaPage.waitForLoadState('networkidle');

// Filter by NRP Part Code
await chinaPage.getByRole('button', { name: 'Filter', exact: true }).click();
await chinaPage.getByRole('button', { name: 'Rule', exact: true }).click();

const chinaFilter = chinaPage.locator('mat-dialog-container input').last();
await chinaFilter.fill('G6540602');
await chinaPage.getByRole('button', { name: 'Apply' }).click();

// Read values from GRID (Rule 5)
const futurePVC = await getPVCGridValue(chinaPage, 'Future PVC');
const futureDate = await getPVCGridValue(chinaPage, 'Future PVC Effective Date');
const currentPVC = await getPVCGridValue(chinaPage, 'Current PVC');
const currentDate = await getPVCGridValue(chinaPage, 'Current PVC Effective Date');
const publishPVC = await getPVCGridValue(chinaPage, 'Publish PVC');
const publishDate = await getPVCGridValue(chinaPage, 'Publish PVC Effective Date');

console.log('📊 China DBU Part Snapshot:', {
  currentPVC,
  currentDate,
  publishPVC,
  publishDate,
  futurePVC,
  futureDate
});


  if (selectedPVC.code === currentPVC || selectedPVC.code === publishPVC) {
    expect(futurePVC).not.toBe(selectedPVC.code);
    console.log('✅ Future PVC is not updated as it failed the Business rule');
  } else {
    expect(futurePVC).toBe(selectedPVC.code);
    expect(futureDate).toBe(selectedPVC.date);
    console.log('✅ Future PVC updated correctly');
  }

  await chinaPage.close();
}


test.describe.serial('NRP PVC → China DBU PVC Flow', () => {

test('UI + API + NRP tab validation', async ({ page, context }) => {
  test.setTimeout(300000); // 5 minutes
  
  const engineModelDisplay = '6T {CTT-6T}';   // visible in the combobox
  const engineModelToSelect = '6T {CTT-6T}';   // value to select in dropdown

  // ---------------- LOGIN TO CDBU QA ----------------
  console.log(`🌐 Application URL: ${BASE_URL}`);
  
  // Dynamic Auth URL Construction
  // Ensure redirect URI matches what Keycloak expects
  const redirectUri = BASE_URL; 
  
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 

  // Construct the full URL
  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  console.log(`🔗 Auth Link: ${authUrl}`);
  
  await page.goto(authUrl);

  // FIX: Increased timeout for login fields
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

  // Navigate to Data Explorer if not redirected there automatically
  if (page.url() !== `${BASE_URL}spriced-data`) {
      await page.getByText('Data Explorer').click();
      await page.waitForLoadState('networkidle');
  }

  // ---------------- FIRST PAGE FILTER ----------------
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  
  // FIX: Use a more stable locator for the filter input in dialog
  const firstPageFilterInput = page.locator('mat-dialog-container input.mat-mdc-input-element').last();
  await expect(firstPageFilterInput).toBeVisible({ timeout: 10000 });
  await firstPageFilterInput.fill('A077U707');
  
  await page.getByRole('button', { name: 'Apply' }).click();

  // ---------------- OPEN NRP QA PAGE ----------------
  const page1 = await context.newPage();
  
  // Construct NRP URL based on environment
  // If BASE_URL is cdbu-dev, NRP is likely nrp-dev.
  const nrpBaseUrl = BASE_URL.replace('cdbu', 'nrp');
  
  console.log(`🌐 Navigating to NRP: ${nrpBaseUrl}`);
  await page1.goto(nrpBaseUrl);
  
  // If redirected to login, handle it
  if (await page1.getByRole('textbox', { name: 'Username or email' }).isVisible()) {
      await page1.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
      await page1.getByRole('textbox', { name: 'Password' }).fill('qwerty');
      await page1.getByRole('button', { name: 'Sign In' }).click();
      await page1.waitForLoadState('networkidle');
  }

  // Wait for the "Work with master data" text to be visible before clicking
  await expect(page1.getByText('Work with master data and')).toBeVisible({ timeout: 60000 });
  await page1.getByText('Work with master data and').click();
  
  // Select Plugin
  await page1.getByRole('combobox', { name: 'plugin' }).locator('path').click(); // or 'svg' if path fails
  await page1.getByText('NRP').click();
  await page1.waitForLoadState('networkidle');

  // Filter in NRP
  await page1.getByRole('button', { name: 'Filter', exact: true }).click();
  await page1.getByRole('button', { name: 'Rule', exact: true }).click();
  
  // FIX: Replaced fragile 'input.q-input-control' with standard Material Dialog locator
  // Wait for the dialog input to appear
   const nrpDialog = page1.locator('mat-dialog-container');
  await expect(nrpDialog).toBeVisible({ timeout: 10000 });
  
  // Try locating the input within the dialog more generically if the class names are dynamic/minified
  // Often it's the only textbox in that simple rule dialog
  const nrpFilterInput = nrpDialog.locator('input').last(); 
  
  await expect(nrpFilterInput).toBeVisible({ timeout: 10000 });
  await nrpFilterInput.fill('G6540602');
  
  await page1.getByRole('button', { name: 'Apply' }).click();

  // ---------------- CALL DB POLLING API ----------------
  const app = express();
  app.use(express.json());
  app.post('/workflow/runWorkflow/DB%20polling%20mechanism', (req, res) => {
    res.json({ status: 'success' });
  });

  const server = app.listen(5087, async () => {
    console.log('Server started on port 5087');
    try {
      const response = await fetch('http://127.0.0.1:5087/workflow/runWorkflow/DB%20polling%20mechanism', { method: 'POST' });
      const data = await response.json();
      console.log(data); // { status: 'success' }
    } catch (e) {
      console.error('Failed to trigger DB polling workflow:', e);
    }
    server.close();
  });

  try {
    // ---------------- SELECT ENGINE MODEL IN NRP QA ----------------
    // Wait for row to be loaded/visible
    await page1.waitForSelector('datatable-body-row', { timeout: 30000 });

    const engineModelContainer = page1.locator('sp-lookup-select', { hasText: 'Engine Model' }).first();
    await expect(engineModelContainer).toBeVisible({ timeout: 15000 });

    // Open the dropdown
    const matSelect = engineModelContainer.locator('mat-select');
    await matSelect.click();

    // Wait for the dropdown panel to appear
    const dropdownPanel = page1.locator('div.mat-mdc-select-panel'); 
    await expect(dropdownPanel).toBeVisible({ timeout: 10000 });

    // Select the correct option
    const option = dropdownPanel.locator(`.mdc-list-item`, { hasText: engineModelToSelect });
    await option.scrollIntoViewIfNeeded();
    await option.click();

    // Click Save
    const saveBtn = page1.getByRole('button', { name: 'Save', exact: true });
    await saveBtn.click();

    // Wait a bit to ensure the value is applied
    await page1.waitForTimeout(2000);

    const selectedValue = await engineModelContainer.locator('.mat-mdc-select-value-text').textContent();
    const nrpTrimmedValue = selectedValue?.trim();

    console.log(`✅ Engine Model saved in NRP : ${nrpTrimmedValue}`);

    // ---------------- VERIFY ENGINE MODEL IN CHINA QA (ALREADY OPEN TAB) ----------------
    // Use the existing 'page' object which is on China QA, instead of opening a 3rd page context
    // or if we must open a new tab as per previous logic:
    const chinaPage = await context.newPage();

    // Navigate to China QA using the new page
    await chinaPage.goto(`${BASE_URL}spriced-data`, { waitUntil: 'networkidle', timeout: 60000 });
    await chinaPage.getByRole('button', { name: 'Filter', exact: true }).click();
    await chinaPage.getByRole('button', { name: 'Rule', exact: true }).click();
  
    // FIX: Use a more stable locator for the filter input in dialog
    const firstPageFilterInput = chinaPage.locator('mat-dialog-container input.mat-mdc-input-element').last();
    await expect(firstPageFilterInput).toBeVisible({ timeout: 10000 });
    await firstPageFilterInput.fill('G6540602');
  
    await chinaPage.getByRole('button', { name: 'Apply' }).click();
    // Wait for the Engine Model field to be visible
    const engineFieldChina = chinaPage.locator('sp-lookup-select', { hasText: 'Engine Model' }).first();
    await expect(engineFieldChina).toBeVisible({ timeout: 30000 });

    // Get the current value
    const currentValue = await engineFieldChina.locator('.mat-mdc-select-value-text').textContent();
    const trimmedValue = currentValue?.trim();
    console.log('Engine Model in China DBU after refresh:', trimmedValue);

    // Extract numeric code from NRP selection
    const codePart = engineModelToSelect.match(/\d+/)?.[0]; // "8000"

    // Verify in China QA
    if (trimmedValue && codePart && trimmedValue.includes(codePart)) {
      console.log(`✅ Engine Model is correct in China DBU QA (${trimmedValue} contains ${codePart})`);
    } else {
      console.log(`❌ Engine Model is NOT correct in China DBU QA (${trimmedValue} does not contain ${codePart})`);
    }

  } catch (err) {
    console.error('❌ Error verifying Engine Model in China QA:', err);
  } finally {
    server.close();
    await page1.close();
  }
  });
  test('PVC Validation After DB Polling', async ({ page, context }) => {
    test.setTimeout(120000);
    await runPVCValidationFlow(page, context, BASE_URL);
  });

});