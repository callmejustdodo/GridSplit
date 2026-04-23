import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
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

test('splits a 1200×900 PNG into 3×4 tiles via the built artifact', async ({ page }) => {
  test.skip(
    !ensureFixture(),
    'tests/fixtures/1200x900.png missing and ImageMagick (magick/convert) not on PATH. ' +
      'Install ImageMagick or commit a real 1200x900 PNG to tests/fixtures/.',
  );
  await page.goto('/');

  await page.setInputFiles('#file', FIXTURE_PATH);
  await page.fill('#rows', '3');
  await page.fill('#cols', '4');

  await expect(page.locator('#split')).toBeEnabled({ timeout: 10_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#split'),
  ]);

  const zipPath = await download.path();
  expect(zipPath).toBeTruthy();
  const bytes = readFileSync(zipPath!);
  const out = unzipSync(new Uint8Array(bytes));
  const names = Object.keys(out).sort();

  expect(names).toHaveLength(12);
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 4; c++) {
      expect(names).toContain(`tile_r${r}_c${c}.png`);
    }
  }
  // Each PNG should parse as 300×225 — sanity-check by PNG IHDR inspection.
  for (const name of names) {
    const data = out[name];
    // PNG signature is 8 bytes; IHDR starts at offset 8 with length+type;
    // width is 4 bytes big-endian at offset 16, height at offset 20.
    const w = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
    const h = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
    expect(w).toBe(300);
    expect(h).toBe(225);
  }
});
