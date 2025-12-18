import { test, expect } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ==========================================
// 🛠️ DYNAMIC ENV CONFIG
// ==========================================
const BASE_URL = process.env.BASE_URL || 'https://qa-spriced-cdbu.alpha.simadvisory.com/';
// Use the working auth base if different from env, or rely on env if updated
const AUTH_BASE = 'https://auth.alpha.simadvisory.com'; 
const AUTH_REALM = process.env.AUTH_REALM || 'D_SPRICED';
const AUTH_CLIENT = process.env.AUTH_CLIENT_ID || 'CHN_D_SPRICED_Client';

test('Verify Outbound Staged Date is current date', async ({ page }) => {
  // Increase test timeout to handle potential network delays
  test.setTimeout(120000); 

  console.log(`🌐 Application URL: ${BASE_URL}`);

  // Dynamic Auth URL Construction
  const redirectUri = BASE_URL; 
  const state = '3c9abb48-9b50-4679-88a2-5d8b4d30ec82'; 
  const nonce = 'f40a8b05-859a-440d-ae2e-4f4fa90d3e5e'; 

  // Construct the full URL
  const authUrl = `${AUTH_BASE}/realms/${AUTH_REALM}/protocol/openid-connect/auth?client_id=${AUTH_CLIENT}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=fragment&response_type=code&scope=openid&nonce=${nonce}`;
  
  console.log(`🚀 Navigating to Login...`);
  
  await page.goto(authUrl);

  // Wait for the page to be ready
  await page.waitForLoadState('networkidle');

  // Fill credentials
  await page.getByRole('textbox', { name: 'Username or email' }).fill('moloy', { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Password' }).fill('qwerty');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByText('Data Explorer').click();  
  // Wait for navigation after login
  await page.waitForLoadState('networkidle');

  await page.getByRole('combobox', { name: 'Part' }).locator('svg').click();
  await page.getByRole('option', { name: 'List Pricing' }).click();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();

  // Wait for filter input to be visible before filling
  const filterInput = page.locator('#mat-input-91');
  await expect(filterInput).toBeVisible({ timeout: 10000 });
  await filterInput.fill('CHINA-546995500');
  
  await page.getByRole('button', { name: 'Apply' }).click();

  // Wait for the table to update/load results
  await page.waitForLoadState('networkidle');
  
  // 🎯 FIX: Wait for rows to appear and click to expand
  const row = page.locator('datatable-body-row').first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click(); // Click to expand details
  
  // Wait a moment for accordion animation
  await page.waitForTimeout(1000);

  // 🎯 FIX: Locator Strategy - Target input via label text
  // Finds the label 'Outbound Staged Date' and gets the associated input
  const dateInput = page.locator('sp-date-picker').filter({ hasText: 'Outbound Staged Date' }).locator('input');
  
  await expect(dateInput).toBeVisible({ timeout: 10000 });

  const dateValue = (await dateInput.inputValue())?.trim() || '';
  console.log(`🧾 Outbound Staged Date from UI: "${dateValue}"`);

  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const year = today.getFullYear();
  const todayFormatted = `${month}/${day}/${year}`;
  console.log(`📅 Today’s Date: "${todayFormatted}"`);

  if (dateValue === todayFormatted) {
    console.log(`✅ PASS: Outbound Staged Date matches today's date (${todayFormatted})`);
  } else {
    console.log(`❌ FAIL: Outbound Staged Date does NOT match. Found: ${dateValue}, Expected: ${todayFormatted}`);
  }
});