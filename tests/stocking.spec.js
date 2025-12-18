import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
const BASE_URL_CDBU = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';
const BASE_URL_NRP = BASE_URL_CDBU.replace('cdbu', 'nrp');

const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = 'D_SPRICED_Client';

const isQA = process.env.TEST_ENV_NAME === 'QA';
const SSH_HOST = isQA ? 'qa-spriced' : 'dev-spriced'; 

test('NRP Stocking Logic: Certification Level vs Suggested Segment', async ({ page }) => {
  test.setTimeout(300000); 

  console.log('🚀 Test Started: NRP Stocking Logic');

  // 1️⃣ TRIGGER CURL COMMAND via SSH
  console.log(`🔹 Triggering remote curl command on ${SSH_HOST}...`);
  
  const triggerCurl = async () => {
    return new Promise((resolve, reject) => {
        const curlCmd = `curl --location 'http://localhost:8099/stock-enhance-ui/on-demand'`;
        const sshArgs = [SSH_HOST, curlCmd];

        console.log(`▶ Executing SSH: ssh ${sshArgs.join(' ')}`);
        const sshProcess = spawn('ssh', sshArgs);

        let stdoutData = '';
        let stderrData = '';

        sshProcess.stdout.on('data', (d) => stdoutData += d.toString());
        sshProcess.stderr.on('data', (d) => stderrData += d.toString());

        sshProcess.on('close', (code) => {
            console.log(`SSH Exit Code: ${code}`);
            if (code === 0) {
                console.log(`🎉 Curl command executed.`);
                console.log(`Output: ${stdoutData.trim()}`);
                resolve(true);
            } else {
                console.error(`❌ Curl command failed.`);
                console.error(`STDERR: ${stderrData}`);
                reject(new Error(`SSH process exited with code ${code}`));
            }
        });
    });
  };

  await triggerCurl();

  // 2️⃣ LOGIN & NAVIGATE TO NRP
  console.log(`🌐 Navigating to NRP: ${BASE_URL_NRP}`);
  
  const redirectUri = BASE_URL_NRP; 
  const state = 'bb5f5119-2a40-4f03-8fa2-7dd5c7e72826'; 
  const nonce = '167e7012-1733-4f3d-bde8-68493ad1c9aa'; 

  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  await page.goto(authUrl);

  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty', { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByText('Data Explorer').click();
  await page.waitForLoadState('networkidle');

  // 3️⃣ SWITCH PLUGIN: SPRICED -> NRP
  console.log('🔹 Switching Plugin to NRP...');
  const pluginCombo = page.getByRole('combobox').filter({ hasText: 'SPRICED' }).first();
  if (await pluginCombo.isVisible()) {
      await pluginCombo.click();
      await page.getByRole('option', { name: 'NRP' }).click();
      await page.waitForLoadState('networkidle');
  } else {
      console.log('⚠️ Could not find "SPRICED" combo, checking fallback.');
      await page.locator('mat-select').first().click();
      if (await page.getByRole('option', { name: 'NRP' }).isVisible()) {
          await page.getByRole('option', { name: 'NRP' }).click();
      } else {
          await page.keyboard.press('Escape');
      }
  }
  
//   await page.getByText('Data Explorer').click();
  await page.waitForLoadState('networkidle');


  // 4️⃣ SELECT ENTITY: PART
  console.log('🔹 Selecting Entity: Part...');
  await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
  const partOption = page.getByRole('option', { name: 'Part' }).first(); 
  if (await partOption.isVisible()) {
      await partOption.click();
  }

  await page.waitForLoadState('networkidle');
  // Filter in NRP
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  
  // FIX: Replaced fragile 'input.q-input-control' with standard Material Dialog locator
  // Wait for the dialog input to appear
   const nrpDialog = page.locator('mat-dialog-container');
  await expect(nrpDialog).toBeVisible({ timeout: 10000 });
  
  // Try locating the input within the dialog more generically if the class names are dynamic/minified
  // Often it's the only textbox in that simple rule dialog
  const nrpFilterInput = nrpDialog.locator('input').last(); 
  
  await expect(nrpFilterInput).toBeVisible({ timeout: 10000 });
  await nrpFilterInput.fill('CTT');
  
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForLoadState('networkidle');
  // 5️⃣ FIND A CODE WITH 'H' IN POSTFIX
  console.log('🔍 Searching for a code NOT ending with "H"...');
  
  // We will iterate through rows to find a valid code
  const rows = page.locator('datatable-body-row');
  const rowCount = await rows.count();
  console.log(`   Scanning ${rowCount} visible rows...`);

  let targetRowIndex = -1;
  let targetCode = '';

  // Get column index for "Code"
  const headers = page.locator('datatable-header-cell');
  let codeColIndex = -1;
  let certColIndex = -1;
  let segmentColIndex = -1;

  for (let i = 0; i < await headers.count(); i++) {
      const title = await headers.nth(i).getAttribute('title');
      if (title === 'Code') codeColIndex = i;
      if (title === 'Certification Level') certColIndex = i;
      if (title === 'Suggested Stocking Segment') segmentColIndex = i;
  }

  if (codeColIndex === -1 || certColIndex === -1 || segmentColIndex === -1) {
      throw new Error('❌ Could not find required columns (Code, Certification Level, Suggested Stocking Segment).');
  }

  for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const codeCell = row.locator('datatable-body-cell').nth(codeColIndex);
      const codeText = (await codeCell.innerText()).trim();

      // 🎯 LOGIC CHANGE: Check if code ends with 'H'
      if (codeText.endsWith('H')) {
          console.log(`   Skipping code ending with H: ${codeText}`);
          continue; // Skip this row
      }

      // If we are here, it's a valid code
      targetRowIndex = i;
      targetCode = codeText;
      console.log(`✅ Found Valid Code: ${targetCode}`);
      break;
  }

  if (targetRowIndex === -1) {
      throw new Error('❌ No valid code (not ending in H) found in the first page of results.');
  }

  // 6️⃣ SELECT ROW AND VALIDATE
  const targetRow = rows.nth(targetRowIndex);
  await targetRow.click(); // Select/Expand row
  await page.waitForTimeout(1000); 

  // Read Certification Level
  const certCell = targetRow.locator('datatable-body-cell').nth(certColIndex);
  const certValue = (await certCell.innerText()).trim();
  console.log(`   Certification Level: "${certValue}"`);

  // Read Annual Volume
  const volumeCell = targetRow.locator('datatable-body-cell').nth(annualVolumeColIndex);
  const volumeValue = (await volumeCell.innerText()).trim();
  console.log(`   Annual Volume: "${volumeValue}"`);

  // Read Suggested Stocking Segment
  const segmentCell = targetRow.locator('datatable-body-cell').nth(segmentColIndex);
  const segmentValue = (await segmentCell.innerText()).trim();
  console.log(`   Suggested Stocking Segment: "${segmentValue}"`);

  // Logic: 
  // If Cert is null/empty -> Expect Segment 'D'
  // Else -> Expect Segment 'A'
  const isCertNull = !certValue || certValue === '';
  const isVolumeNull = !volumeValue || volumeValue === '' || volumeValue === '0';
  const expectedSegment = (isCertNull && isVolumeNull) ? 'D' : 'A';

  console.log(`   Logic: Cert is ${isCertNull ? 'NULL' : 'PRESENT'} & Volume is ${isVolumeNull ? 'NULL' : 'PRESENT'} -> Expecting Segment '${expectedSegment}'`);

  if (segmentValue === expectedSegment) {
      console.log('✅ PASS: Suggested Stocking Segment matches expected logic.');
  } else {
      console.log(`❌ FAIL: Expected '${expectedSegment}', but got '${segmentValue}'.`);
      expect(segmentValue).toBe(expectedSegment);
  }

  console.log('🏁 Test completed.');
});