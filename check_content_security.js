'use strict';

import { chromium } from 'playwright';
import fs from 'fs';
import 'dotenv/config';

const apps = fs
  .readFileSync('fields.csv', 'utf8')
  .split('\n')
  .map(row => row.split(',')[0])
  .slice(1)
  .filter((app, index, self) => self.indexOf(app) === index)
    .sort();

const browser = await chromium.launch();

const context = await browser.newContext({
  baseURL: process.env.INSTANCE_URL,
});

const page = await context.newPage();

await page.goto('/Public/Login');
await page.getByPlaceholder('Username').fill(process.env.INSTANCE_USERNAME);
await page.getByPlaceholder('Password').fill(process.env.INSTANCE_PASSWORD);
await page.getByText('Login').click();
await page.waitForURL(/dashboard/i);

const appsWithContentSecurity = ['App'];

for (const app of apps) {
  console.log(`Checking ${app}...`);
  const initialRead = page.waitForResponse(/\/Admin\/App\/AppsListRead/);
  await page.goto('/Admin/App');
  await initialRead;

  const response = page.waitForResponse(/\/Admin\/App\/AppsListRead/);
  await page.getByPlaceholder('Filter By').clear();
  await page.getByPlaceholder('Filter By').fill(app);
  await response;

  const textContent = await page.locator('.k-grid-content').textContent();

  if (!textContent) {
    await page.goto('/Admin/Survey');
    await page.getByPlaceholder('Filter By').clear();
    await page.getByPlaceholder('Filter By').fill(app);
  }

  await page.getByRole('row', { name: app }).first().click();
  await page.getByRole('tab', { name: 'Content Security' }).click();

  const setting = await page
    .locator('td.label:has-text("Permission Configuration") + td.text')
    .textContent();

  if (setting !== null && setting.includes('Private')) {
    appsWithContentSecurity.push(app);
  }
}

if (appsWithContentSecurity.length === 1) {
  console.log('No apps with content security');
} else {
  console.log(
    `Found ${
      appsWithContentSecurity.length - 1
    } apps with content security. Writing to appsWithContentSecurity.csv...`
  );
  fs.writeFileSync(
    'appsWithContentSecurity.csv',
    appsWithContentSecurity.join('\n')
  );
}

await page.close();
await context.close();
await browser.close();
