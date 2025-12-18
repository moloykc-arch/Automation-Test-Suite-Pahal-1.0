import { test, expect } from '@playwright/test';
import { regionsConfig } from './regionsConfig-approval.js';
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

test('test', async ({ browser}) => 
    {
    // -------------------- LOOP THROUGH REGIONS --------------------
    for (const { region, productCode } of regionsConfig) 
        {
            console.log(`\n--- Processing Region: ${region} with Product Code: ${productCode} ---`);
            try{
                const context = await browser.newContext();
                const page = await context.newPage();
                
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

                await page.getByRole('textbox', { name: 'Username or email' }).click({
                    modifiers: ['ControlOrMeta']
                });
                // FIX: Timeout increased
                await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
                await page.getByRole('textbox', { name: 'Password' }).click({
                    modifiers: ['ControlOrMeta']
                });
                await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
                await page.getByRole('button', { name: 'Sign In' }).click();
                
                // Wait for redirect to app
                await page.waitForLoadState('networkidle');

                await page.getByText('storageData Explorer Work').click();
                await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
                await page.getByRole('option', { name: 'List Pricing' }).click();

                await page.getByRole('button', { name: 'Filter', exact: true }).click();
                await page.getByRole('button', { name: 'Rule', exact: true }).click();
                await page.locator('#mat-input-91').fill(productCode);
                await page.getByRole('button', { name: 'Apply' }).click();


                await page.locator('#cdk-accordion-child-0').getByText('Calculated Local Currency').click();
                await page.locator('#mat-input-52').click();

                // Wait for filter results to appear (add a delay or spinner check if needed)
                await page.waitForTimeout(2000);

                // ---------------- CALCULATED LOCAL CURRENCY ----------------
                const calcLocalCurrency = page.locator('sp-numeric', { hasText: 'Calculated Local Currency List Price' });
                await calcLocalCurrency.waitFor({ state: 'visible', timeout: 30000 });

                // Locate the <input> inside the sp-numeric field
                const calcLocalInput = calcLocalCurrency.locator('input');

                // Get the current input value from UI
                let calcLocalValue = await calcLocalInput.evaluate(input => input.value.replace(/,/g, '').trim());

                if (!calcLocalValue || isNaN(Number(calcLocalValue))) {
                    console.log('Calculated Local Currency is empty or invalid, setting it to 100...');
                    await calcLocalInput.fill('100');
                    calcLocalValue = '100';
                } else {
                    console.log('Calculated Local Currency already has value:', calcLocalValue);
                }

                // Verify that the field now has a numeric value
                const finalValue = await calcLocalInput.evaluate(input => parseFloat(input.value.replace(/,/g, '').trim()));
                expect(finalValue).toBeGreaterThan(0);

                console.log('Final Calculated Local Currency List Price:', finalValue);

                // ---------------- FUTURE USD LIST PRICE ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Future USD List Price').click();
                await page.locator('#mat-input-58').click();
                await page.waitForTimeout(500);

                const futureUsdNumeric = page.locator('sp-numeric', { hasText: 'Future USD List Price' });
                await futureUsdNumeric.waitFor({ state: 'visible', timeout: 60000 });
                const futureUsdValue = await futureUsdNumeric.locator('input').evaluate(input => input.value.replace(/,/g, '').trim());
                console.log('Future USD List Price Value:', futureUsdValue);
                const isFutureUsdNotNull = futureUsdValue !== '' && futureUsdValue !== null && !isNaN(Number(futureUsdValue));

                // ---------------- FUTURE LOCAL CURRENCY LIST PRICE ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Future Local Currency List').click();
                await page.locator('#mat-input-50').click();
                await page.waitForTimeout(2000);

                const futureLocalNumeric = page.locator('sp-numeric', { hasText: 'Future Local Currency List' });
                await futureLocalNumeric.waitFor({ state: 'visible', timeout: 30000 });
                const futureLocalValue = await futureLocalNumeric.locator('input').evaluate(input => input.value.replace(/,/g, '').trim());
                console.log('Future Local Currency List Price Value:', futureLocalValue);
                const isFutureLocalNotNull = futureLocalValue !== '' && futureLocalValue !== null && !isNaN(Number(futureLocalValue));

                // ---------------- FUTURE LOCAL CURRENCY LP EFFECTIVE DATE ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Future Local Currency LP').click();
                await page.locator('#mat-input-51').click();
                await page.waitForTimeout(2000);

                const futureLocalDatePicker = page.locator('sp-date-picker', { hasText: 'Future Local Currency LP Effective Date' });
                await futureLocalDatePicker.waitFor({ state: 'visible', timeout: 30000 });
                const dateValue = await futureLocalDatePicker.locator('input').evaluate(input => input.value.trim());
                console.log('Future Local Currency LP Effective Date Value:', dateValue);
                const isFutureLocalDateNotNull = dateValue !== '' && dateValue !== null;

                // ---------------- LP OVERRIDE FLAG ----------------
                await page.locator('#cdk-accordion-child-0').getByText('LP Override Flag').click();
                await page.waitForTimeout(1000);

                const lpOverrideSelect = page.locator('sp-lookup-select', { hasText: 'LP Override Flag' });
                await lpOverrideSelect.waitFor({ state: 'visible', timeout: 60000 });
                const selectedValue = await lpOverrideSelect.locator('.mat-mdc-select-value span').first().innerText();
                console.log('LP Override Flag selected value:', selectedValue);
                const isLpOverrideYes = selectedValue.trim() === 'Yes';

                // ---------------- PRICING ACTIONS: EMERGENCY CHECK ----------------
                // Declare variables at top-level to use in Condition ii
                let chinaValue = '', dnValue = '', pvcValue = '';

                try {
                    // China Pricing Action
                    const chinaContainer = page.locator('sp-lookup-select', { has: page.locator('mat-label', { hasText: 'China Pricing Action' }) }).first();
                    await chinaContainer.scrollIntoViewIfNeeded();
                    const chinaSelect = chinaContainer.locator('mat-select').first();
                    await chinaSelect.waitFor({ state: 'visible', timeout: 15000 });
                    try { chinaValue = (await chinaSelect.locator('.mat-mdc-select-value span').first().innerText()).trim(); } catch {}

                    // DN Pricing Action
                    const dnContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'DN Pricing Action' }) }).first();
                    await dnContainer.scrollIntoViewIfNeeded();
                    const dnInput = dnContainer.locator('input[matinput]').first();
                    await dnInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { dnValue = (await dnInput.inputValue()).trim(); } catch {}

                    // PVC Pricing Action
                    const pvcContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'PVC Pricing Action' }) }).first();
                    await pvcContainer.scrollIntoViewIfNeeded();
                    const pvcInput = pvcContainer.locator('input[matinput]').first();
                    await pvcInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { pvcValue = (await pvcInput.inputValue()).trim(); } catch {}
                } catch (err) {
                    console.error('❌ Error fetching pricing actions:', err);
                }

                // ---------------- ELIGIBILITY CHECK ----------------

                // Log all relevant values first
                console.log('--- Eligibility Check for Approval Processing ---');
                console.log('Calculated Local Currency List Price:', finalValue);
                console.log('Future USD List Price:', futureUsdValue, 'Not Null:', isFutureUsdNotNull);
                console.log('Future Local Currency List Price:', futureLocalValue, 'Not Null:', isFutureLocalNotNull);
                console.log('Future Local Currency LP Effective Date:', dateValue, 'Not Null:', isFutureLocalDateNotNull);
                console.log('LP Override Flag:', selectedValue, 'Is Yes:', isLpOverrideYes);
                console.log('China Pricing Action:', chinaValue);
                console.log('DN Pricing Action:', dnValue);
                console.log('PVC Pricing Action:', pvcValue);

                // Check eligibility conditions
                const isCalcLocalCurrencyValid = finalValue !== 0;
                console.log('Condition - Calculated Local Currency not zero:', isCalcLocalCurrencyValid ? '✅ Passed' : '❌ Failed');

                // Condition i: Future prices and LP Override
                const conditionI = (isFutureUsdNotNull || (isFutureLocalNotNull && isFutureLocalDateNotNull)) && isLpOverrideYes;
                console.log('Condition i - Future Prices and LP Override:');
                console.log('  Future USD Not Null:', isFutureUsdNotNull);
                console.log('  Future Local Currency Not Null:', isFutureLocalNotNull);
                console.log('  Future Local Currency LP Date Not Null:', isFutureLocalDateNotNull);
                console.log('  LP Override Yes:', isLpOverrideYes);
                console.log('  Condition i Result:', conditionI ? '✅ Passed' : '❌ Failed');

                // Condition ii: Emergency Pricing Actions
                const isEmergencyPresent = [chinaValue, dnValue, pvcValue].some(val => val.includes('Emergency'));
                const conditionII = isEmergencyPresent && isFutureLocalNotNull && isFutureLocalDateNotNull;
                console.log('Condition ii - Emergency Pricing Actions:');
                console.log('  Emergency Present (China/DN/PVC):', isEmergencyPresent);
                console.log('  Future Local Currency Not Null:', isFutureLocalNotNull);
                console.log('  Future Local Currency LP Date Not Null:', isFutureLocalDateNotNull);
                console.log('  Condition ii Result:', conditionII ? '✅ Passed' : '❌ Failed');

                // Overall eligibility
                const isEligible = isCalcLocalCurrencyValid && (conditionI || conditionII);
                console.log('--- Overall Eligibility ---');
                console.log('Eligible for Approval Processing:', isEligible ? '✅ Yes' : '❌ No');

                // If not eligible, skip this region and continue to next
                if (!isEligible) {
                    console.log(`❌ ${productCode} is NOT eligible. Move to next region.`);
                    await context.close();
                    continue; // <-- this moves to next region in the loop
                }

                // If eligible, proceed with next steps
                console.log(`✅ ${productCode} is eligible. Proceeding with approval and next process.`);

                // Optional: you can still keep assertion for eligible regions if needed
                expect(isEligible).toBe(true);

                // ---------------- PRICING MANAGER APPROVAL ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Pricing Manager Approval').click();
                await page.waitForTimeout(500);

                const approvalSelect = page.locator('sp-lookup-select', { hasText: 'Pricing Manager Approval Status' });
                await approvalSelect.waitFor({ state: 'visible', timeout: 30000 });

                // Get current value
                let currentApproval = '';
                try {
                currentApproval = (await approvalSelect.locator('.mat-mdc-select-value span').first().innerText()).trim();
                console.log('Pricing Manager Approval Status:', currentApproval);
                } catch (err) {
                console.log('Pricing Manager Approval Status is currently empty or not set');
                }

                // 1. NULL → select "Ready for Review"
                // 2. YES / NO → clear field
                // 3. Other → leave unchanged

                if (!currentApproval) {
                console.log('Status is null → Selecting "Ready for Review"');
                await approvalSelect.locator('mat-select').click();
                await page.locator('mat-option', { hasText: 'Ready for Review' }).click();
                console.log('✅ Pricing Manager Approval set to Ready for Review');
                } else if (currentApproval.toUpperCase() === 'YES' || currentApproval.toUpperCase() === 'NO') {
                console.log('Status is YES/NO → Clearing the field');
                await approvalSelect.locator('button[title="Clear"]').click();
                console.log('✅ Pricing Manager Approval cleared');
                } else {
                console.log('Status has other value → Leaving unchanged:', currentApproval);
                }

                // ---------------- FETCH LP THRESHOLD LEVEL 1 ----------------
                const lpContext = await browser.newContext();
                const lpPage = await lpContext.newPage();

                // Dynamic Auth for Threshold Page
                const authThresholdUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;

                // Go to the LP Threshold page
                await lpPage.goto(authThresholdUrl);

                await lpPage.getByRole('textbox', { name: 'Username or email' }).fill('moloy');
                await lpPage.getByRole('textbox', { name: 'Password' }).fill('qwerty');
                await lpPage.getByRole('button', { name: 'Sign In' }).click();
                await lpPage.waitForLoadState('networkidle');

                await lpPage.getByText('Data Explorer').click();
                await lpPage.getByRole('combobox', { name: 'Part' }).locator('path').click();
                await lpPage.getByText('004 Threshold').click();

                // Expand the accordion if necessary
                await lpPage.locator('div', { hasText: /^LP Overwrte Threshold Level 1$/ }).first().click();
                await lpPage.waitForTimeout(1000); // let it expand

                // Find the <input> that belongs to the label "LP Overwrte Threshold Level 1"
                const lpThresholdInput = lpPage.locator('sp-numeric', { hasText: 'LP Overwrte Threshold Level 1' }).locator('input[type="text"]');

                await lpThresholdInput.waitFor({ state: 'visible', timeout: 60000 });

                // Get the value directly
                const lpThreshold = await lpThresholdInput.evaluate(input =>
                parseFloat(input.value.replace(/,/g, '').trim() || '0')
                );

                console.log('✅ LP Overwrite Threshold Level 1:', lpThreshold);


                // ---------------- APPROVER 1 ----------------
                const approver1Accordion = page.locator('#cdk-accordion-child-0').getByText('Approver 1');
                await approver1Accordion.waitFor({ state: 'visible', timeout: 60000 });
                await approver1Accordion.scrollIntoViewIfNeeded();
                await approver1Accordion.click();

                const approver1Select = page.locator('sp-lookup-select', { hasText: 'Approver 1' });
                await approver1Select.waitFor({ state: 'visible', timeout: 60000 });

                // Get current value safely
                let currentApprover1 = '';
                try {
                currentApprover1 = (await approver1Select.locator('.mat-mdc-select-value span').first().innerText()).trim();
                console.log('Current Approver 1 Status:', currentApprover1);
                } catch (err) {
                console.log('Approver 1 Status is currently empty or not set');
                }

                // ---------------- LP OVERRIDE FLAG ----------------
                await page.locator('#cdk-accordion-child-0').getByText('LP Override Flag').click();
                await page.waitForTimeout(1000);

                const lpOverrideSelect1 = page.locator('sp-lookup-select', { hasText: 'LP Override Flag' });
                await lpOverrideSelect1.waitFor({ state: 'visible', timeout: 60000 });
                const selectedValue1 = await lpOverrideSelect1.locator('.mat-mdc-select-value span').first().innerText();
                console.log('LP Override Flag selected value:', selectedValue);
                const isLpOverride1Yes = selectedValue1.trim() === 'Yes';
                console.log('LP Override Flag:', selectedValue, 'Is Yes:', isLpOverride1Yes);

                // ---------------- PRICING ACTIONS: EMERGENCY CHECK ----------------
                let china1Value = '', dn1Value = '', pvc1Value = '';

                try {
                    // China Pricing Action
                    const chinaContainer = page.locator('sp-lookup-select', { has: page.locator('mat-label', { hasText: 'China Pricing Action' }) }).first();
                    await chinaContainer.scrollIntoViewIfNeeded();
                    const chinaSelect = chinaContainer.locator('mat-select').first();
                    await chinaSelect.waitFor({ state: 'visible', timeout: 15000 });
                    try { china1Value = (await chinaSelect.locator('.mat-mdc-select-value span').first().innerText()).trim(); } catch {}

                    // DN Pricing Action
                    const dnContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'DN Pricing Action' }) }).first();
                    await dnContainer.scrollIntoViewIfNeeded();
                    const dnInput = dnContainer.locator('input[matinput]').first();
                    await dnInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { dn1Value = (await dnInput.inputValue()).trim(); } catch {}

                    // PVC Pricing Action
                    const pvcContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'PVC Pricing Action' }) }).first();
                    await pvcContainer.scrollIntoViewIfNeeded();
                    const pvcInput = pvcContainer.locator('input[matinput]').first();
                    await pvcInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { pvc1Value = (await pvcInput.inputValue()).trim(); } catch {}
                } catch (err) {
                    console.error('❌ Error fetching pricing actions:', err);
                }
                const isEmergencyPresent1 = [china1Value, dn1Value, pvc1Value].some(val => val.includes('Emergency'));
                

                // ---------------- FETCH LIST PRICES ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Current Local Currency List').click();
                await page.locator('#mat-input-46').click();
                const currentLocal = parseFloat(await page.locator('#mat-input-46').inputValue()) || 0;
                console.log('Approver 1 currentLocal:', currentLocal);

                await page.locator('div').filter({ hasText: /^Future Local Currency List Price$/ }).nth(2).click();
                await page.locator('#mat-input-50').click();
                const futureLocal = parseFloat(await page.locator('#mat-input-50').inputValue()) || 0;
                console.log('Approver 1 futureLocal:', futureLocal);

                await page.locator('#cdk-accordion-child-0').getByText('Current USD List Price').click();
                await page.locator('.mat-mdc-form-field-infix.ng-tns-c1205077789-136').click();
                const currentUsd = parseFloat(await page.locator('#mat-input-54').inputValue()) || 0; // make sure id is correct
                console.log('Approver 1 currentUsd:', currentUsd);

                await page.locator('#cdk-accordion-child-0').getByText('Future USD List Price').click();
                await page.locator('#mat-input-58').click();
                const futureUsd = parseFloat(await page.locator('#mat-input-58').inputValue()) || 0;
                console.log('Approver 1 futureUsd:', futureUsd);


                // Calculate percentage changes
                const localPct = currentLocal ? ((futureLocal - currentLocal) / currentLocal) * 100 : 0;
                console.log('Approver 1 localPct:', localPct);
                const usdPct = currentUsd ? ((futureUsd - currentUsd) / currentUsd) * 100 : 0;
                console.log('Approver 1 usdPct:', usdPct);

                let expectedApprover1 = '';

                if (currentApprover1.toUpperCase() === 'YES' || currentApprover1.toUpperCase() === 'NO') {
                    expectedApprover1 = currentApprover1;
                } else if ((selectedValue1 === 'No' || selectedValue1 === '') && isEmergencyPresent1) {
                    expectedApprover1 = 'Auto';
                } else if (localPct >= lpThreshold || usdPct >= lpThreshold) {
                    expectedApprover1 = 'Ready for Review';
                } else {
                    expectedApprover1 = 'Auto';
                }

                    // ---------------- COMPARE CURRENT VS EXPECTED ----------------
                let isMatch1 = false;

                // Handle null/empty expected
                if (expectedApprover1 === null) {
                    isMatch1 = !currentApprover1 || currentApprover1.trim() === '';
                } else {
                    isMatch1 = currentApprover1.trim().toUpperCase() === expectedApprover1.trim().toUpperCase();
                }

                // Log results
                if (isMatch1) {
                    console.log('✅ MATCH - Current Approver 1:', currentApprover1, '| Expected:', expectedApprover1);
                } else {
                    console.log('❌ MISMATCH - Current Approver 1:', currentApprover1, '| Expected:', expectedApprover1);
                }


                // ---------------- FETCH LP THRESHOLD LEVEL 2 ----------------

                await lpPage.locator('#cdk-accordion-child-0').getByText('LP Overwrte Threshold Level 2').click();
                await lpPage.waitForTimeout(1000); // wait for accordion to expand

                // Locate the input inside <sp-numeric> for Level 2
                const lpThreshold2Input = lpPage.locator('sp-numeric', { hasText: 'LP Overwrte Threshold Level 2' }).locator('input[type="text"]');

                await lpThreshold2Input.waitFor({ state: 'visible', timeout: 60000 });

                // Get the value and parse as float
                const lpThreshold2 = await lpThreshold2Input.evaluate(input =>
                parseFloat(input.value.replace(/,/g, '').trim() || '0')
                );

                console.log('✅ LP Overwrite Threshold Level 2:', lpThreshold2);

                
                await lpPage.close();
                await lpContext.close();


                // ---------------- APPROVER 2 ----------------
                const approver2Accordion = page.locator('#cdk-accordion-child-0').getByText('Approver 2');
                await approver2Accordion.waitFor({ state: 'visible', timeout: 60000 });
                await approver2Accordion.scrollIntoViewIfNeeded();
                await approver2Accordion.click();

                const approver2Select = page.locator('sp-lookup-select', { hasText: 'Approver 2' });
                await approver2Select.waitFor({ state: 'visible', timeout: 60000 });

                // Get current value safely
                let currentApprover2 = '';
                try {
                    currentApprover2 = (await approver2Select.locator('.mat-mdc-select-value span').first().innerText()).trim();
                    console.log('Current Approver 2 Status:', currentApprover2);
                } catch (err) {
                    console.log('Approver 2 Status is currently empty or not set');
                }

                // ---------------- LP OVERRIDE FLAG ----------------
                await page.locator('#cdk-accordion-child-0').getByText('LP Override Flag').click();
                await page.waitForTimeout(1000);

                const lpOverrideSelect2 = page.locator('sp-lookup-select', { hasText: 'LP Override Flag' });
                await lpOverrideSelect2.waitFor({ state: 'visible', timeout: 60000 });
                const selectedValue2 = await lpOverrideSelect2.locator('.mat-mdc-select-value span').first().innerText();
                console.log('LP Override 2 Flag selected value:', selectedValue2);
                const isLpOverride2Yes = selectedValue2.trim() === 'Yes';
                console.log('LP Override 2 Flag:', selectedValue2, 'Is Yes:', isLpOverride2Yes);

                // ---------------- PRICING ACTIONS: EMERGENCY CHECK ----------------
                let china2Value = '', dn2Value = '', pvc2Value = '';

                try {
                    // China Pricing Action
                    const chinaContainer = page.locator('sp-lookup-select', { has: page.locator('mat-label', { hasText: 'China Pricing Action' }) }).first();
                    await chinaContainer.scrollIntoViewIfNeeded();
                    const chinaSelect = chinaContainer.locator('mat-select').first();
                    await chinaSelect.waitFor({ state: 'visible', timeout: 15000 });
                    try { china2Value = (await chinaSelect.locator('.mat-mdc-select-value span').first().innerText()).trim(); } catch {}

                    // DN Pricing Action
                    const dnContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'DN Pricing Action' }) }).first();
                    await dnContainer.scrollIntoViewIfNeeded();
                    const dnInput = dnContainer.locator('input[matinput]').first();
                    await dnInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { dn2Value = (await dnInput.inputValue()).trim(); } catch {}

                    // PVC Pricing Action
                    const pvcContainer = page.locator('sp-input', { has: page.locator('mat-label', { hasText: 'PVC Pricing Action' }) }).first();
                    await pvcContainer.scrollIntoViewIfNeeded();
                    const pvcInput = pvcContainer.locator('input[matinput]').first();
                    await pvcInput.waitFor({ state: 'visible', timeout: 15000 });
                    try { pvc2Value = (await pvcInput.inputValue()).trim(); } catch {}
                } catch (err) {
                    console.error('❌ Error fetching pricing actions:', err);
                }
                const isEmergencyPresent2 = [china2Value, dn2Value, pvc2Value].some(val => val.includes('Emergency'));

                // ---------------- FETCH LIST PRICES ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Current Local Currency List').click();
                await page.locator('#mat-input-46').click();
                const currentLocal2 = parseFloat(await page.locator('#mat-input-46').inputValue()) || 0;
                console.log('Approver 2 currentLocal:', currentLocal2);

                await page.locator('div').filter({ hasText: /^Future Local Currency List Price$/ }).nth(2).click();
                await page.locator('#mat-input-50').click();
                const futureLocal2 = parseFloat(await page.locator('#mat-input-50').inputValue()) || 0;
                console.log('Approver 2 futureLocal:', futureLocal2);

                await page.locator('#cdk-accordion-child-0').getByText('Current USD List Price').click();
                await page.locator('.mat-mdc-form-field-infix.ng-tns-c1205077789-136').click();
                const currentUsd2 = parseFloat(await page.locator('#mat-input-54').inputValue()) || 0;
                console.log('Approver 2 currentUsd:', currentUsd2);

                await page.locator('#cdk-accordion-child-0').getByText('Future USD List Price').click();
                await page.locator('#mat-input-58').click();
                const futureUsd2 = parseFloat(await page.locator('#mat-input-58').inputValue()) || 0;
                console.log('Approver 2 futureUsd:', futureUsd2);

                // Calculate percentage changes
                const localPct2 = currentLocal2 ? ((futureLocal2 - currentLocal2) / currentLocal2) * 100 : 0;
                console.log('Approver 2 localPct:', localPct2);
                const usdPct2 = currentUsd2 ? ((futureUsd2 - currentUsd2) / currentUsd2) * 100 : 0;
                console.log('Approver 2 usdPct:', usdPct2);

                // ---------------- APPLY APPROVER 2 LOGIC ----------------
                let expectedApprover2 = '';

                if (currentApprover2.toUpperCase() === 'YES' || currentApprover2.toUpperCase() === 'NO') {
                    expectedApprover2 = null; // Priority i: assign NULL
                } else if ((selectedValue2 === 'No' || selectedValue2 === '') && isEmergencyPresent2) {
                    expectedApprover2 = 'Auto'; // Priority ii
                } else if (localPct2 >= lpThreshold2 || usdPct2 >= lpThreshold2) {
                    expectedApprover2 = 'Ready for Review'; // Priority iii
                } else {
                    expectedApprover2 = 'Auto'; // fallback
                }

                // ---------------- COMPARE CURRENT VS EXPECTED ----------------
                let isMatch2 = false;

                // Handle null/empty expected
                if (expectedApprover2 === null) {
                    isMatch2 = !currentApprover2 || currentApprover2.trim() === '';
                } else {
                    isMatch2 = currentApprover2.trim().toUpperCase() === expectedApprover2.trim().toUpperCase();
                }

                // Log results
                if (isMatch2) {
                    console.log('✅ MATCH - Current Approver 2:', currentApprover2, '| Expected:', expectedApprover2);
                } else {
                    console.log('❌ MISMATCH - Current Approver 2:', currentApprover2, '| Expected:', expectedApprover2);
                }


                // ---------------- APPROVER 3 ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Approver 3').click();
                await page.waitForTimeout(500);

                const approver3Select = page.locator('sp-lookup-select', { hasText: 'Approver 3' });
                await approver3Select.waitFor({ state: 'visible', timeout: 30000 });

                await approver3Select.locator('mat-select').click();
                await page.locator('mat-option', { hasText: 'Auto' }).click();
                console.log('✅ Approver 3 set to Auto');

                // ---------------- APPROVER 4 ----------------
                await page.locator('#cdk-accordion-child-0').getByText('Approver 4').click();
                await page.waitForTimeout(500);

                const approver4Select = page.locator('sp-lookup-select', { hasText: 'Approver 4' });
                await approver4Select.waitFor({ state: 'visible', timeout: 30000 });

                await approver4Select.locator('mat-select').click();
                await page.locator('mat-option', { hasText: 'Auto' }).click();
                console.log('✅ Approver 4 set to Auto');

                console.log(`--- Completed processing for ${productCode} ---\n`);
                await context.close();
            }  
            catch (err) 
            {
            console.error(`❌ Error processing ${productCode}:`, err);
            }
        }
    }
);