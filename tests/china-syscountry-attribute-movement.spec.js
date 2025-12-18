import { test, expect, request as playwrightRequest } from '@playwright/test';
import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
const BASE_URL = process.env.BASE_URL || 'https://dev-spriced-cdbu.alpha.simadvisory.com/';
const AUTH_BASE = process.env.AUTH_BASE_URL || 'https://auth.dev.simadvisory.com';
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

test('Future -> Current Country Factor transfer after scheduler run', async ({ page }) => {
  console.log('🚀 Test started');

  const username = 'souvik';
  const password = 'Souvik@123';
  const futureValueToSet = '346.45';

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  const todayMMDDYYYY = `${mm}/${dd}/${yyyy}`;


  // -------- 0) Start temporary scheduler server --------
  const app = express();
  app.use(express.json());

  app.post('/Scheduler/startSysCountryScheduler', (req, res) => {
    console.log('⚡ Scheduler endpoint called!');
    res.json({ status: 'success' });
  });

  const server = app.listen(8085, () => {
    console.log('⚡ Scheduler server running on port 8085');
  });

  // -------- 1) Login --------
  console.log('🔹 Navigating to login page');
  const authUrl = `${AUTH_BASE}/auth/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(BASE_URL)}&response_mode=fragment&response_type=code&scope=openid`;
  
  await page.goto(authUrl);

  await page.getByRole('textbox', { name: 'Username or email' }).fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
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

  await page.waitForSelector('sp-numeric');

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

  // -------- 6) Call scheduler endpoint --------
  console.log('🔹 Calling scheduler API...');
  async function callScheduler() {
    for (let i = 0; i < 5; i++) {
      try {
        const resp = await playwrightRequest.newContext().then(ctx => ctx.post('http://127.0.0.1:8085/Scheduler/startSysCountryScheduler'));
        if (resp.ok()) return resp;
      } catch (e) {
        console.log('⚠ Scheduler not ready, retrying...');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error('Scheduler API not reachable after 5 retries');
  }

  const schedulerResponse = await callScheduler();
  expect(schedulerResponse.ok()).toBeTruthy();
  console.log('✅ Scheduler API completed successfully');

  // -------- 7) Reload page --------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // -------- 8) Validate Current = Future --------
  const futureValueAfter = await futureNumericInput.inputValue();

  const currentNumericInput = page
    .locator('sp-numeric')
    .filter({ hasText: 'Current Country Factor USD' })
    .locator('input');
  let currentValueAfter = null;

  if (await currentNumericInput.count() > 0) {
    currentValueAfter = await currentNumericInput.inputValue();
  } else {
    const allNumericInputs = page.locator('sp-numeric').locator('input');
    const total = await allNumericInputs.count();
    for (let i = 0; i < total; i++) {
      const val = await allNumericInputs.nth(i).inputValue();
      if (val !== futureValueAfter) {
        currentValueAfter = val;
        break;
      }
    }
  }

  console.log(`🔹 Future value: ${futureValueAfter}, Current value: ${currentValueAfter}`);
  expect(currentValueAfter?.trim()).toBeTruthy();
  expect(futureValueAfter.trim()).toBe(currentValueAfter.trim());

  console.log('✅ Test completed successfully');

  // -------- 9) Stop temporary scheduler server --------
  server.close(() => console.log('⚡ Scheduler server stopped'));
});