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

// --- CONFIGURATION ---
const TARGET_PART_NUMBER = '388322200'; 
const INPUT_DATE = new Date(); 
// Construct Reports URL based on environment (qa vs dev)
// Assuming standard pattern: https://reports.qa-spriced-cdbu...
const REPORTS_URL = BASE_URL.replace('https://', 'https://reports.').replace('dev-', 'qa-') + 'pricing-report'; 
// Note: If dev/qa URL structures differ significantly, adjust logic or use env var.
// Defaulting to QA reports URL for safety if base url logic is complex, or use direct string if preferred.
// const REPORTS_URL = 'https://reports.qa-spriced-cdbu.alpha.simadvisory.com/pricing-report';

// --- HELPER FUNCTIONS ---
function calculateListPrice(publishPrice, publishDateStr, currentPrice, currentDateStr, inputDate) {
    const pubDate = publishDateStr ? new Date(publishDateStr) : new Date('9999-12-31');
    const curDate = currentDateStr ? new Date(currentDateStr) : new Date('9999-12-31');

    if (publishPrice && pubDate <= inputDate) {
        return parseFloat(publishPrice);
    }
    if (currentPrice && curDate <= inputDate) {
        return parseFloat(currentPrice);
    }
    return 0; // Return 0 if no valid price found
}

function calculateBasePriceChanged(publishDateStr, currentDateStr, inputDate) {
    const pubDate = publishDateStr ? new Date(publishDateStr) : null;
    const curDate = currentDateStr ? new Date(currentDateStr) : null;

    if (pubDate && pubDate <= inputDate) {
        return 'Publish Base Price Changed';
    }
    if (curDate && curDate <= inputDate) {
        return 'Current Base Price changed';
    }
    return ''; 
}

const parseCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9.-]+/g, ''));
};


test('Validate Pricing Report Logic vs Data Explorer', async ({ page }) => {
    test.setTimeout(120000); 

    // ==========================================
    // 1. LOGIN
    // ==========================================
    console.log('🚀 Starting Login...');
    console.log(`🌐 Application URL: ${BASE_URL}`);

    // Dynamic Auth URL Construction
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
    await page.waitForLoadState('networkidle');

    // ==========================================
    // 2. FETCH SOURCE DATA (Data Explorer)
    // ==========================================
    console.log('📥 Fetching Source Data from Data Explorer...');
    
    // Navigate to Data Explorer
    await page.getByText('Data Explorer').click();
    await page.waitForLoadState('networkidle');

    // Robustly Select "List Pricing" View
    await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
    await page.getByRole('option', { name: 'List Pricing' }).locator('span').click();
    await page.waitForLoadState('networkidle');

    // Filter by Part Number
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('button', { name: 'Rule', exact: true }).click();
    
    // Using locator strategy from your snippet for filter
    // await page.locator('div').filter({ hasText: /^Is equal to$/ }).nth(3).click(); // This index might be unstable
    // await page.getByText('Contains pattern').click();
    
    // Use the robust locator for dialog input we established previously
    const filterInput = page.locator('mat-dialog-container input.mat-mdc-input-element').last();
    await expect(filterInput).toBeVisible({ timeout: 10000 });
    await page.locator('div').filter({ hasText: /^Is equal to$/ }).nth(3).click();
    await page.getByText('Contains pattern').click();
    await filterInput.fill(TARGET_PART_NUMBER);
    
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(10000); // Wait for grid reload
    
    const chinaRow = page.locator('datatable-body-row').filter({ hasText: 'CHINA' }).first();
    
    // Check if China row exists, otherwise fail early
    if (await chinaRow.count() === 0) {
        throw new Error("❌ 'CHINA' region row not found in Data Explorer! Please check filters.");
    }
    console.log("✅ Found CHINA region.");
    
    // Extract Data from Grid
    const sourceData = {};
    async function getSourceValue(headerName) {
        const headers = page.locator('datatable-header-cell');
        const count = await headers.count();
        let index = -1;
        for(let i=0; i<count; i++) {
            const text = await headers.nth(i).textContent();
            if(text.trim() === headerName) {
                index = i;
                break;
            }
        }
        if (index === -1) return null;
        
        // Target the cell inside the identified chinaRow
        return await chinaRow.locator('datatable-body-cell').nth(index).textContent();
    }

    // Capture Fields
    sourceData.partNumber = (await getSourceValue('Part Number')).trim();
    sourceData.name = (await getSourceValue('Name')).trim();
    sourceData.itemGroup = (await getSourceValue('Item Group')).trim();
    
    sourceData.publishLocalPrice = parseCurrency(await getSourceValue('Publish Local Currency List Price'));
    sourceData.publishLocalEffDate = (await getSourceValue('Publish Local Currency LP Effective Date')).trim();
    
    sourceData.currentLocalPrice = parseCurrency(await getSourceValue('Current Local Currency List Price'));
    sourceData.currentLocalEffDate = (await getSourceValue('Current Local Currency LP Effective Date')).trim();

    sourceData.publishUSDPrice = parseCurrency(await getSourceValue('Publish USD List Price'));
    sourceData.publishUSDEffDate = (await getSourceValue('Publish USD LP Effective Date')).trim();

    sourceData.currentUSDPrice = parseCurrency(await getSourceValue('Current USD List Price'));
    sourceData.currentUSDEffDate = (await getSourceValue('Current USD LP Effectve Date')).trim();

    console.log('✅ Source Data Extracted:', sourceData);

    // ==========================================
    // 3. GENERATE REPORT (Target Data)
    // ==========================================
    console.log('📊 Generating Pricing Report...');
    
    // Ensure REPORTS_URL is correct for environment
    // Use the QA reports URL if running in QA context, or dev otherwise
    // Hardcoding based on your snippet for now, but ideally dynamic
    const reportsTargetUrl = 'https://reports.qa-spriced-cdbu.alpha.simadvisory.com/pricing-report';

    const reportPage = await page.context().newPage();
    await reportPage.goto(reportsTargetUrl);
    await reportPage.waitForLoadState('networkidle');
    
    // FIX: Navigate Directly to Reports URL instead of relying on popup
    await reportPage.getByRole('button', { name: 'All ▾' }).click();
    await reportPage.getByRole('button', { name: '30' }).first().click();
    await reportPage.getByRole('textbox', { name: 'Enter part numbers (comma,' }).click();
    await reportPage.getByRole('textbox', { name: 'Enter part numbers (comma,' }).fill(TARGET_PART_NUMBER);
    await reportPage.getByRole('button', { name: 'SUBMIT' }).click();
    
    const table = reportPage.locator('.table-responsive table');
    await expect(table).toBeVisible({ timeout: 60000 });

    // --- 🛠️ DYNAMIC HEADER MAPPING LOGIC ---
    console.log('🗺️ Mapping Table Headers...');
    
    // Now 'table' is defined, so we can search inside it
    const headerLocators = table.locator('thead th');
    const headerCount = await headerLocators.count();
    const columnIndexMap = {};

    for (let i = 0; i < headerCount; i++) {
        // Get visible text, remove sort icons/newlines if any
        const rawText = await headerLocators.nth(i).innerText(); 
        const cleanName = rawText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        columnIndexMap[cleanName] = i;
    }
    
    console.log(`✅ Found ${Object.keys(columnIndexMap).length} columns.`);

    // --- Helper to extract value by Column Name ---
    // Note: We need to find the specific row for our Part Number first
    const gridRow = table.locator('tbody tr').filter({ hasText: TARGET_PART_NUMBER }).first();
    await expect(gridRow).toBeVisible();

    async function getUIValue(columnName) {
        const key = Object.keys(columnIndexMap).find(k => k.toLowerCase().includes(columnName.toLowerCase()));
        
        if (!key) {
            console.warn(`⚠️ Column "${columnName}" not found in headers.`);
            return null;
        }
        
        const index = columnIndexMap[key];
        const cell = gridRow.locator('td').nth(index);
        return (await cell.innerText()).trim();
    }

    // --- Extract Data ---
    const reportData = {};
    
    reportData.partNumber = await getUIValue('Part number');
    reportData.name = await getUIValue('Name');
    reportData.itemGroup = await getUIValue('Item group');
    
    reportData.mainlandListPriceRMB = parseCurrency(await getUIValue('Mainland db list price (rmb, no vat)'));
    reportData.mainlandBaseChanged = await getUIValue('Mainland db base price changed');

    console.log('✅ Report Data Extracted:', reportData);

    // ==========================================
    // 4. VALIDATE LOGIC
    // ==========================================
    console.log('⚖️ Validating Logic...');

    // 🛠️ FIX: Clean the Source Part Number
    // Format: "A077S591 {KIT,HARDWARE}" -> Split by " {" -> Take "A077S591"
    const cleanSourcePartNumber = sourceData.partNumber.split(' {')[0].trim();

    console.log(`🔍 Comparing Part Numbers: Source Cleaned "${cleanSourcePartNumber}" vs Report "${reportData.partNumber}"`);

    // Validate Part Number
    expect(reportData.partNumber).toBe(cleanSourcePartNumber);
    
    // Validate Name
    expect(reportData.name).toBe(sourceData.name);
    
    // Validate Item Group
    expect(reportData.itemGroup).toBe(sourceData.itemGroup);
    
    console.log('✅ Direct Columns Match.');

    // Validate Mainland List Price Logic
    const expectedMainlandPrice = calculateListPrice(
        sourceData.publishLocalPrice, 
        sourceData.publishLocalEffDate,
        sourceData.currentLocalPrice, 
        sourceData.currentLocalEffDate,
        INPUT_DATE
    );

    console.log(`🧮 Mainland Calculation: Expected ${expectedMainlandPrice} vs Report ${reportData.mainlandListPriceRMB}`);
    
    if (expectedMainlandPrice !== 0) {
        expect(reportData.mainlandListPriceRMB).toBeCloseTo(expectedMainlandPrice, 2);
    } else {
        // If calculation expects 0, ensure report is 0
        expect(reportData.mainlandListPriceRMB).toBe(0); 
    }
    console.log('✅ Mainland DB List Price Logic Validated.');

    // Cleanup
    await reportPage.close();
});