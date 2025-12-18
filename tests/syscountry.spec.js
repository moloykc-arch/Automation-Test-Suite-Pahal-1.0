import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
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

// Determine Environment for SSH
const isQA = process.env.TEST_ENV_NAME === 'QA';
// Use 'qa-spriced' alias for QA, and 'dev-spriced' for DEV
const SSH_HOST = isQA ? 'qa-spriced' : 'dev-spriced'; 

test('Future -> Current Country Factor transfer after scheduler run', async ({ page }) => {
  console.log('🚀 Test started');

  const username = 'souvik';
  const password = 'Souvik@123';
  const futureValueToSet = `${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  const todayMMDDYYYY = `${mm}/${dd}/${yyyy}`;

  // -------- 1) Login --------
  console.log('🔹 Navigating to login page');
  console.log(`🌐 Application URL: ${BASE_URL}`);
  
  // Dynamic Auth URL Construction
  const redirectUri = BASE_URL; 
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 

  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  console.log(`🔗 Auth Link: ${authUrl}`);
  
  await page.goto(authUrl);

  // FIX: Increased timeout for login fields
  await page.getByRole('textbox', { name: 'Username or email' }).fill(username, { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill(password, { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
  console.log('✅ Logged in successfully');

  // -------- 2) Navigate to sys Country --------
  console.log('🔹 Navigating to sys Country');
  await page.getByText('storageData Explorer Work').click();
  console.log('🔹 Clicked storageData Explorer Work menu');

  await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
  console.log('🔹 Clicked Part dropdown');

  await page.getByText('sys Country').click();
  console.log('✅ Selected sys Country');

  // await page.waitForSelector('sp-numeric');
  await page.locator('datatable-body-cell').filter({ hasText: 'TAIWAN' }).first().click();
  await page.waitForLoadState('networkidle');

  // -------- 3) Fill Future Country Factor USD --------
  const futureNumericInput = page
    .locator('sp-numeric')
    .filter({ hasText: 'Future Country Factor USD' })
    .locator('input');
  await futureNumericInput.waitFor({ state: 'visible' });
  await futureNumericInput.fill(futureValueToSet);
  console.log(`🔹 Set Future Country Factor USD = ${futureValueToSet}`);


  // -------- 4) Fill Future Effective Date --------
  const futureDateInput = page
    .locator('sp-date-picker')
    .filter({ hasText: 'Future Country Factor USD Effective Date' })
    .locator('input');
  await futureDateInput.waitFor({ state: 'visible' });
  await futureDateInput.fill(todayMMDDYYYY);
  console.log(`🔹 Set Effective Date = ${todayMMDDYYYY}`);

  // -------- 5) Save --------
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForLoadState('networkidle');
  console.log('✅ Saved SysCountry record');

  // -------- 6) Call scheduler endpoint (Remote Trigger via SSH) --------
  console.log('🔹 Calling scheduler API remotely...');
  
  const triggerScheduler = async () => {
    return new Promise((resolve, reject) => {
        // Define remote curl command (fetching only status code)
        const curlCmd = `curl -s -o /dev/null -w "%{http_code}" --location 'http://localhost:8085/Scheduler/startSysCountryScheduler'`;
        
        let sshArgs;
        if (isQA) {
            // QA: ssh qa-spriced "curl ..."
            sshArgs = [SSH_HOST, curlCmd];
            console.log(`🚀 Triggering Scheduler on '${SSH_HOST}' (Direct Command)...`);
        } else {
            // DEV: ssh dev-spriced "curl ..."
            sshArgs = [SSH_HOST, curlCmd];
            console.log(`🚀 Triggering Scheduler on '${SSH_HOST}' (Direct Command)...`);
        }

        console.log(`▶ Executing SSH command: ssh ${sshArgs.join(' ')}`);

        const sshProcess = spawn('ssh', sshArgs);

        let stdoutData = '';
        let stderrData = '';

        sshProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        sshProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        sshProcess.on('close', (code) => {
            console.log(`SSH Exit Code: ${code}`);
            const output = stdoutData.trim();
            
            if (code === 0) {
                if (output.includes('200')) {
                    console.log(`🎉 Scheduler triggered successfully. Status Code: 200`);
                    resolve(true);
                } else {
                    console.error(`❌ Scheduler failed. Expected HTTP 200, got output: ${output}`);
                    reject(new Error(`Scheduler API returned unexpected output: ${output}`));
                }
            } else {
                console.error(`❌ Scheduler execution failed (SSH Error).`);
                console.error(`STDOUT: ${output}`);
                console.error(`STDERR: ${stderrData}`);
                reject(new Error(`SSH process exited with code ${code}`));
            }
        });

        sshProcess.on('error', (err) => {
            console.error(`❌ Failed to spawn SSH process: ${err.message}`);
            reject(err);
        });
    });
  };

  // Execute the trigger
  await triggerScheduler();
  console.log('✅ Scheduler API completed successfully');

  // -------- 7) Wait and Refresh Loop --------
  // 🎯 FIX: Polling Logic to wait for backend processing
  // The scheduler takes time to move Future -> Current.
  // We expect Future to become empty/null and Current to match the value we set.
  
  console.log('⏳ Waiting for scheduler to process data...');
  
  // We'll try up to 5 times, waiting 10 seconds between tries (50s total)
  let success = false;
  let futureValueAfter = '';
  let currentValueAfter = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`🔄 Attempt ${attempt}/5: Waiting 10s then refreshing...`);
      await page.waitForTimeout(10000); 
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000); // Allow UI to hydrate

      // Re-fetch elements after reload
      const futureInput = page.locator('sp-numeric').filter({ hasText: 'Future Country Factor USD' }).locator('input');
      await futureInput.waitFor({ state: 'attached', timeout: 30000 });
      futureValueAfter = await futureInput.inputValue();

      const currentInput = page.locator('sp-numeric').filter({ hasText: 'Current Country Factor USD' }).locator('input');
      
      // Handle potential multiple inputs for Current (fallback logic from original)
      if (await currentInput.count() > 0) {
          currentValueAfter = await currentInput.inputValue();
      } else {
          // Fallback search
          const allNumericInputs = page.locator('sp-numeric').locator('input');
          const total = await allNumericInputs.count();
          for (let i = 0; i < total; i++) {
              const val = await allNumericInputs.nth(i).inputValue();
              // Heuristic: If it's the value we set, it's likely the Current field now
              if (val.trim() === futureValueToSet) {
                  currentValueAfter = val;
                  break;
              }
          }
      }

      console.log(`   Future: "${futureValueAfter}" | Current: "${currentValueAfter}"`);

      // 🎯 Validation Condition:
      // 1. Future should be empty (or reset)
      // 2. Current should match the value we set in Future earlier
      if (!futureValueAfter && currentValueAfter.trim() === futureValueToSet) {
          console.log('✅ Data updated successfully!');
          success = true;
          break;
      }
  }

  if (!success) {
      console.error('❌ Timeout: Scheduler did not update the values within the time limit.');
  }

  // -------- 8) Final Assertion --------
  expect(success, 'Scheduler update verification').toBe(true);
  expect(futureValueAfter).toBeFalsy(); // Should be empty/null
  expect(currentValueAfter.trim()).toBe(futureValueToSet); // Should match what we set

  console.log('✅ Test completed successfully');
});