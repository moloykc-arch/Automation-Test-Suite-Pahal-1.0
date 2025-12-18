const { chromium, expect } = require('playwright/test'); // Import expect

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log('🚀 Browser launched.');

    // Dynamic Auth URL Construction
    const authBase = 'https://auth.alpha.simadvisory.com';
    const authRealm = 'D_SPRICED';
    const authClient = 'CHN_D_SPRICED_Client';
    const redirectUri = 'https://qa-spriced-cdbu.alpha.simadvisory.com/';
    const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82';
    const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e';
    
    const authUrl = `${authBase}/realms/${authRealm}/protocol/openid-connect/auth?client_id=${authClient}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;

    console.log(`🚀 Navigating to Login: ${authUrl}`);
    await page.goto(authUrl);

    // 🔐 Login
    console.log('🔐 Performing login...');
    await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
    await page.getByRole('textbox', { name: 'Password' }).fill('qwerty');
    await page.getByRole('button', { name: 'Sign In' }).click();
    console.log('✅ Login submitted.');
    
    await page.waitForLoadState('networkidle');

    // 🆕 Data Explorer Click
    console.log('📂 Clicking "Data Explorer"...');
    await page.getByText('Data Explorer').click();
    await page.waitForLoadState('networkidle');

    // 🧭 Navigate to List Pricing
    console.log('🧭 Navigating to List Pricing...');
    await page.getByRole('combobox', { name: 'Part' ,timeout: 30000}).locator('svg').click();
    await page.getByRole('option', { name: 'List Pricing' }).locator('span').click();
    await page.waitForTimeout(30000);
    
    console.log('🔍 Applying filters...');
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('button', { name: 'Rule', exact: true }).click();
    await page.getByRole('combobox', { name: 'Code' }).locator('path').click();
    await page.getByRole('option', { name: 'Part Number', exact: true }).locator('span').click();
    
    await page.locator('#mat-input-93').waitFor({ state: 'visible', timeout: 90000 });
    await page.locator('#mat-input-93').click();
    await page.getByRole('button', { name: 'selectItem' }).click();
    await page.getByRole('button', { name: 'Add Filter' }).click();

    await page.locator('#mat-mdc-dialog-2').getByRole('button', { name: 'Rule', exact: true }).click();
    await page.locator('#mat-input-94').click();
    console.log(`✏️ Filling List Pricing Code: 388322200`);
    await page.locator('#mat-input-94').fill('388322200');
    await page.locator('#mat-mdc-dialog-2').getByRole('button', { name: 'Apply' }).click();
    
    await page.getByText('388322200').click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    console.log('✅ Filter applied.');
    
    // NEW: Extract "Markup Factor for Local Currency List Price"
    console.log('📥 Extracting LP Markup Factor...');
    
    // Expand the accordion to see details (usually the first row detail)
    const lpRow = page.locator('datatable-body-row').first();
    await lpRow.click(); // Click row to expand details if needed
    
    // Refined Locator: Find the label first, then the input next to it or under it
    // The previous locator might have failed if multiple numeric fields existed.
    // We target the input specifically associated with the label.
    
    const lpMarkupLabel = page.locator('mat-label', { hasText: 'Markup Factor for Local Currency List Price' }).first();
    // Locate the input that is a sibling or descendant relative to the label's container
    // Assuming structure: <sp-numeric> <mat-form-field> <label>...</label> <input>... </mat-form-field> </sp-numeric>
    const lpMarkupFactorInput = page.locator('sp-numeric').filter({ has: lpMarkupLabel }).locator('input').first();
    
    await lpMarkupFactorInput.waitFor({ state: 'visible', timeout: 30000 });
    let lpMarkupValue = await lpMarkupFactorInput.inputValue();
    console.log(`   Raw LP Value: "${lpMarkupValue}"`);
    lpMarkupValue = lpMarkupValue ? parseFloat(lpMarkupValue.replace(/,/g, '').trim()) : 0;
    console.log(`📊 Parsed LP Markup Factor: ${lpMarkupValue}`);


    // 🧩 Open new page for markup comparison
    console.log('🧩 Opening new page for Markup comparison...');
    const page1 = await context.newPage();
    console.log(`🌐 Navigating to ${'https://qa-spriced-cdbu.alpha.simadvisory.com/'}spriced-data...`);
    await page1.goto('https://qa-spriced-cdbu.alpha.simadvisory.com/spriced-data');
    
    console.log('🧭 Navigating to Markup...');
    await page1.getByRole('combobox', { name: 'List Pricing' }).locator('svg').click();
    await page1.getByText('006 Markup').click();
    
    console.log('🔍 Filtering by Markup Code...');
    await page1.getByRole('button', { name: 'Filter', exact: true }).click();
    await page1.getByRole('button', { name: 'Rule', exact: true }).click();
    const markupFilterInput = page1.locator('mat-dialog-container input.mat-mdc-input-element').last();
    await markupFilterInput.click();
    console.log(`✏️ Filling Markup Code: 978`);
    await markupFilterInput.fill('978');
    await page1.getByRole('button', { name: 'Apply' }).click();
    
    // Wait for grid to load results
    await page1.waitForSelector('datatable-body-row', { timeout: 30000 });
    // Click row to expand details
    await page1.locator('datatable-body-row').first().click();

    // NEW: Extract "Current CM Markup Factor"
    console.log('📥 Extracting Current CM Markup Factor...');
    const cmMarkupLabel = page1.locator('mat-label', { hasText: 'Current CM Markup Factor' }).first();
    const cmMarkupFactorInput = page1.locator('sp-numeric').filter({ has: cmMarkupLabel }).locator('input').first();
    
    await cmMarkupFactorInput.waitFor({ state: 'visible', timeout: 30000 });
    let cmMarkupValue = await cmMarkupFactorInput.inputValue();
    console.log(`   Raw CM Value: "${cmMarkupValue}"`);
    cmMarkupValue = cmMarkupValue ? parseFloat(cmMarkupValue.replace(/,/g, '').trim()) : 0;
    console.log(`📊 Parsed Current CM Markup Factor: ${cmMarkupValue}`);
    
    // NEW: Compare Values
    console.log('⚖️ Comparing values...');
    // Allow small floating point difference
    if (Math.abs(lpMarkupValue - cmMarkupValue) < 0.001) {
        console.log("✅ PASS: Markup factors match.");
    } else {
        console.error(`❌ FAIL: Mismatch! LP Markup: ${lpMarkupValue} vs CM Markup: ${cmMarkupValue}`);
        process.exit(1); // Fail the script
    }

    await browser.close();
    console.log('🏁 Playwright script execution completed.');
})();
