import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file://' + path.join(dir, 'warm-preview.html'));
await page.waitForTimeout(1200); // let webfonts load
await page.screenshot({ path: path.join(dir, 'warm-preview.png'), fullPage: true });
await browser.close();
console.log('done');
