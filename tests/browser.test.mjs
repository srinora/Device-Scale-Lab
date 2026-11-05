// SPDX-License-Identifier: GPL-3.0-only
// Requires installed Google Chrome. Uses temporary profiles; no personal accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
const close = server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
// Cross-origin frame locator coordinates omit the parent's CSS transform in
// Chrome. Map a real mouse click from logical viewport to displayed pixels.
async function clickInPreview(page, index, target) {
  const iframe = page.locator('.device-screen iframe').nth(index);
  await iframe.scrollIntoViewIfNeeded();await target.waitFor({ state: 'visible' });
  const point = await target.evaluate(element => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  const viewport = await iframe.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  const box = await iframe.boundingBox();
  await page.mouse.click(box.x + point.x * box.width / viewport.width, box.y + point.y * box.height / viewport.height);
}

test('standalone calibration: live scale, finish/exit autosave, hide/show, dialog cancel and narrow layout', { timeout: 45000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.click('[data-source="rectangles"]');await page.click('#physicalMode');
    await page.locator('#livePpi').fill('96');await page.locator('#livePpi').press('Tab');
    await page.waitForFunction(() => !renderQueued);
    const before = await page.locator('.device-screen').first().evaluate(e => e.getBoundingClientRect().width);
    await page.locator('#calibrationSlider').focus();await page.locator('#calibrationSlider').press('ArrowRight');
    assert.equal(await page.evaluate(() => state.cssPpi), 96.25);
    await page.locator('#livePpi').fill('120');await page.locator('#livePpi').press('Tab');
    await page.waitForFunction(() => $('physicalRuler').getBoundingClientRect().width > 472);
    await page.waitForFunction(() => !renderQueued);
    const after = await page.locator('.device-screen').first().evaluate(e => e.getBoundingClientRect().width);
    assert.ok(Math.abs(after / before - 1.25) < 0.002);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('devicescale-lab-v1')).cssPpi), 120);
    await page.click('#referenceCalibrateBtn');await page.locator('#manualPpi').fill('200');await page.click('#closeCalibration');
    assert.equal(await page.evaluate(() => state.cssPpi), 120);
    await page.click('#smallerRuler');assert.equal(await page.evaluate(() => state.cssPpi), 119.75);
    await page.click('#largerRuler');assert.equal(await page.evaluate(() => state.cssPpi), 120);
    await page.click('#rulerBtn');assert.equal(await page.locator('#referencePanel').isVisible(), false);
    assert.equal(await page.locator('#rulerBtn').textContent(), 'Show ruler');
    await page.reload();assert.equal(await page.locator('#referencePanel').isVisible(), false);
    assert.equal(await page.evaluate(() => state.cssPpi), 120);
    await page.click('#rulerBtn');
    // An unfinished input is captured even without a blur/change before leaving.
    await page.locator('#livePpi').fill('125');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('devicescale-lab-v1')).cssPpi), 125);
    await page.locator('#livePpi').fill('4500');await page.locator('#livePpi').press('Tab');
    assert.equal(await page.locator('#calibrationSlider').getAttribute('max'), '4500');
    await page.locator('#livePpi').fill('96');await page.locator('#livePpi').press('Tab');await page.click('#fitMode');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#referencePanel').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await page.screenshot({ path: path.join(os.tmpdir(), 'devicescale-slider-mobile.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('standalone URL previews support direct interaction, preserve frame isolation and respect blocked embedding', { timeout: 45000 }, async () => {
  const fixture = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...(url.pathname === '/blocked' ? { 'X-Frame-Options': 'DENY' } : {}) });
    if (url.pathname === '/submitted') { res.end('<h1>Form submitted</h1><p id="result">' + (url.searchParams.get('name') === 'Device tester' ? 'Device tester' : 'Unknown') + '</p>');return; }
    res.end(`<!doctype html><html><head><title>Embedded test</title></head><body style="font:20px system-ui;padding:48px 16px;background:#dcecf8">
      <h1>Interactive preview</h1><button id="count" onclick="this.textContent=String(Number(this.textContent)+1)">0</button>
      <form action="/submitted"><label>Name <input name="name"></label><button>Submit</button></form>
      <a href="#bottom">Scroll down</a><p style="margin-top:1200px" id="bottom">Bottom of preview</p>
      </body></html>`);
  });
  const website = await listen(fixture);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [], requests = [];page.on('pageerror', e => errors.push(e.message));page.on('request', req => requests.push(req.url()));
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.click('[data-source="url"]');await page.locator('#urlText').fill(website);await page.click('#applyUrlBtn');
    // Let the initial stage ResizeObserver debounce settle before interacting.
    await page.waitForTimeout(250);
    const frames = page.locator('.device-screen iframe');
    assert.equal(await frames.count(), 3);
    const first = page.frameLocator('.device-screen iframe').nth(0), second = page.frameLocator('.device-screen iframe').nth(1);
    await clickInPreview(page, 0, first.locator('#count'));
    assert.equal(await first.locator('#count').textContent(), '1');
    assert.equal(await second.locator('#count').textContent(), '0');
    assert.equal(await frames.first().evaluate(e => e.style.width), '375px');
    assert.match(await frames.first().getAttribute('sandbox'), /allow-same-origin/);
    await clickInPreview(page, 0, first.getByLabel('Name'));await page.keyboard.type('Device tester');
    await clickInPreview(page, 0, first.getByRole('button', { name: 'Submit' }));
    await first.getByRole('heading', { name: 'Form submitted' }).waitFor();
    assert.equal(await first.locator('#result').textContent(), 'Device tester');
    await clickInPreview(page, 1, second.getByRole('link', { name: 'Scroll down' }));
    assert.ok(await second.locator('body').evaluate(e => e.ownerDocument.defaultView.scrollY) > 0);
    assert.equal(context.pages().length, 1);
    assert.equal(await page.locator('#urlEngine').count(), 0);
    assert.equal(requests.some(url => url.includes('/api/') || url.startsWith('http://127.0.0.1:8765')), false);

    const before = await page.evaluate(() => state.url);
    for (const url of ['javascript:alert(1)', 'https://user:password@example.com']) {
      await page.locator('#urlText').fill(url);await page.click('#applyUrlBtn');
      assert.equal(await page.evaluate(() => state.url), before);
      assert.match(await page.locator('#toast').textContent(), /without credentials/);
    }
    await page.locator('#urlText').fill(website + '/blocked');
    const blocked = page.waitForResponse(website + '/blocked');await page.click('#applyUrlBtn');await blocked;
    assert.match(await page.locator('#toast').textContent(), /Preview requested/);
    assert.match(await page.locator('#urlPanel').textContent(), /may block embedding/);
    assert.equal(await first.locator('#count').count(), 0);

    await page.click('[data-source="html"]');
    await page.locator('#htmlText').fill('<!doctype html><p id="result">Waiting</p><script>try { parent.localStorage.getItem("devicescale-lab-v1"); result.textContent="exposed"; } catch { result.textContent="isolated"; }</script>');
    await page.click('#applyHtmlBtn');
    await first.getByText('isolated', { exact: true }).waitFor();
    assert.equal(await frames.first().getAttribute('sandbox'), 'allow-scripts allow-forms');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();await close(fixture);
  }
});
