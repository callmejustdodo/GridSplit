import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = resolve(__dirname, '../fixtures/1200x900.png');

function ensureFixture(): boolean {
  if (existsSync(FIXTURE_PATH)) return true;
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  for (const cmd of ['magick', 'convert']) {
    try {
      execSync(`${cmd} -size 1200x900 gradient:red-blue ${FIXTURE_PATH}`, { stdio: 'ignore' });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

test('performs a split with zero network requests after initial load', async ({ page }) => {
  test.skip(
    !ensureFixture(),
    'tests/fixtures/1200x900.png missing and ImageMagick (magick/convert) not on PATH.',
  );

  await page.goto('/');
  await page.waitForLoadState('load');

  const requestsAfterLoad: string[] = [];
  page.on('request', (req) => {
    requestsAfterLoad.push(req.url());
  });

  await page.setInputFiles('#file', FIXTURE_PATH);
  await page.fill('#rows', '3');
  await page.fill('#cols', '4');
  await expect(page.locator('#split')).toBeEnabled({ timeout: 10_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#split'),
  ]);
  await download.path();

  // Data-URLs / blob: URLs are allowed (they're not network traffic).
  const network = requestsAfterLoad.filter(
    (u) => !u.startsWith('data:') && !u.startsWith('blob:'),
  );
  expect(network).toEqual([]);
});
