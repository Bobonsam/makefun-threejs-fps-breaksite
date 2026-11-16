// Capture the four dossier screenshots from the local server with headless Chromium.
// Waits for the game's own window.__shotReady flag, so every frame is the real
// simulation settled — never a staged render.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const shots = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));
const base = 'http://127.0.0.1:8123';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] });
for (const shotDef of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(base + '/' + shotDef.query, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 90000 });
  } catch {
    errors.push('TIMEOUT waiting for __shotReady');
  }
  await page.screenshot({ path: new URL('./screenshots/' + shotDef.name, import.meta.url).pathname, type: 'jpeg', quality: 82 });
  console.log(shotDef.name, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
  await page.close();
}
await browser.close();
