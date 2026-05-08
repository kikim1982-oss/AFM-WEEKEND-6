const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- Tiny inline PNG encoder ---------------------------------------------
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, cr]);
}
function makeGradientPng(w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 3) + 1 + x * 3;
      raw[o]     = Math.floor(255 * (x / w));
      raw[o + 1] = Math.floor(120 * (1 - y / h) + 80);
      raw[o + 2] = Math.floor(255 * (y / h));
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- Test runner ----------------------------------------------------------
(async () => {
  const testImagePath = path.join(__dirname, 'test-image.png');
  fs.writeFileSync(testImagePath, makeGradientPng(480, 320));

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [console.error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

  console.log('[1] Loading http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=이미지 업로드 테스트');
  await page.screenshot({ path: path.join(screenshotsDir, '01-initial.png'), fullPage: true });
  console.log('    OK - initial page rendered');

  console.log('[2] Setting file input ...');
  await page.locator('input[type="file"]').setInputFiles(testImagePath);

  // Capture "uploading" state if we're fast enough
  try {
    await page.waitForSelector('text=업로드 중', { timeout: 4000 });
    await page.screenshot({ path: path.join(screenshotsDir, '02-uploading.png'), fullPage: true });
    console.log('    OK - captured uploading state');
  } catch {
    console.log('    (uploading state too brief to capture)');
  }

  console.log('[3] Waiting for upload completion ...');
  await page.waitForSelector('text=업로드 완료', { timeout: 30000 });
  await page.screenshot({ path: path.join(screenshotsDir, '03-uploaded.png'), fullPage: true });
  console.log('    OK - thumbnail shows 업로드 완료');

  const url = await page.locator('input[readonly]').first().inputValue();
  console.log('    ImageKit URL:', url);
  if (!url.startsWith('https://ik.imagekit.io/kikim1982/')) {
    throw new Error('Returned URL does not match expected endpoint: ' + url);
  }

  console.log('[4] Verifying public URL is reachable ...');
  const head = await page.request.get(url);
  console.log('    HEAD-like GET status =', head.status(), ' content-type =', head.headers()['content-type']);
  if (head.status() !== 200) throw new Error('Uploaded URL not reachable');

  console.log('[5] Hovering thumbnail to reveal remove button ...');
  const card = page.locator('.group').first();
  await card.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotsDir, '04-hover-actions.png'), fullPage: true });

  console.log('[6] Clicking copy URL button ...');
  await page.locator('button[aria-label="URL 복사"]').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotsDir, '05-url-copied.png'), fullPage: true });

  console.log('[7] Uploading a second file to test counters ...');
  fs.writeFileSync(path.join(__dirname, 'test-image-2.png'), makeGradientPng(360, 360));
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, 'test-image-2.png'));
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.group')).length === 2,
    { timeout: 5000 }
  );
  await page.waitForFunction(
    () => document.body.innerText.match(/2 완료|업로드 완료/g)?.length >= 2,
    { timeout: 30000 }
  );
  await page.screenshot({ path: path.join(screenshotsDir, '06-two-uploaded.png'), fullPage: true });
  console.log('    OK - both images uploaded');

  await browser.close();
  console.log('\nAll tests passed.');
  console.log('Screenshots saved in:', screenshotsDir);
})().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
