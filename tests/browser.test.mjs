// SPDX-License-Identifier: GPL-3.0-only
// Requires installed Google Chrome. Uses temporary profiles; no personal accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { BrowserCompanion } from '../companion/browser.mjs';
import { createCompanionServer } from '../companion/server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
const close = server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
async function idle(page) { await page.waitForFunction(() => !companion.busy && !companion.force && companion.lastKey === companionKey(), null, { timeout: 60000 }); }

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
    await page.click('[data-source="url"]');await page.selectOption('#urlEngine', 'companion');await page.click('#connectCompanion');
    assert.match(await page.locator('#companionStatus').textContent(), /npm start/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('companion captures blocked-frame pages, shares login, keeps tabs through calibration/reorder, resizes, recovers and restarts', { timeout: 120000 }, async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'dslab-browser-test-'));
  const fixture = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(302, { 'Set-Cookie': 'dslab_test_login=yes; Path=/; Max-Age=3600; SameSite=Lax; HttpOnly', Location: '/account' });res.end();return;
    }
    if (req.url === '/missing') { res.writeHead(404);res.end('Test missing page');return; }
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' });
    const signedIn = (req.headers.cookie || '').includes('dslab_test_login=yes');
    res.end('<!doctype html><html><head><title>Local browser test</title></head><body style="font:24px system-ui;background:#dcecf8"><h1>' + (signedIn ? 'Signed in' : 'Please sign in') + '</h1><form method="post" action="/login"><button>Sign in for test</button></form><p>Viewport <span id="size"></span></p><script>size.textContent=innerWidth+" × "+innerHeight</script></body></html>');
  });
  const website = await listen(fixture);
  const manager = new BrowserCompanion({ profileDir, headless: true, navigationTimeout: 3000 });
  const { server } = createCompanionServer({ manager });
  const origin = await listen(server);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);await page.waitForFunction(() => companion.token && !companion.busy);
    await page.click('[data-source="url"]');await page.selectOption('#urlEngine', 'companion');
    await page.locator('#urlText').fill(website);await page.click('#applyUrlBtn');await idle(page);
    assert.equal(manager.pages.size, 3);
    assert.equal(await page.locator('[data-browser-image]:visible').count(), 3);
    const entries = [...manager.pages.values()];
    assert.deepEqual(entries[0].page.viewportSize(), { width: 375, height: 667 });
    assert.equal(await entries[0].page.locator('h1').textContent(), 'Please sign in');
    await page.locator('[data-browser-focus]').first().click();await page.waitForFunction(() => !companion.busy);
    await entries[0].page.getByRole('button', { name: 'Sign in for test' }).click();
    await page.click('#reloadBrowserPages');await page.waitForFunction(() => !companion.busy);
    for (const entry of entries) assert.equal(await entry.page.locator('h1').textContent(), 'Signed in');
    const oldURLs = entries.map(e => e.page.url());
    await page.locator('#livePpi').fill('110');await page.locator('#livePpi').press('Tab');await page.click('#physicalMode');
    await page.locator('[data-act="right"]').first().click();
    await idle(page);
    for (const entry of entries) assert.equal(manager.pages.get(entry.id).page, entry.page);
    assert.deepEqual(entries.map(e => e.page.url()), oldURLs);
    await page.evaluate(id => document.querySelector('[data-act="rotate"][data-instance="' + id + '"]').click(), entries[0].id);
    await idle(page);assert.deepEqual(entries[0].page.viewportSize(), { width: 667, height: 375 });
    assert.equal(entries[0].page.url(), oldURLs[0]);
    const data = await page.evaluate(() => [...companion.images.values()][0].image);
    assert.equal(Buffer.from(data.split(',')[1], 'base64').subarray(1, 4).toString(), 'PNG');
    await page.click('#fitMode');await page.screenshot({ path: path.join(os.tmpdir(), 'devicescale-companion.png') });
    const firstCapture = await page.evaluate(() => [...companion.images.values()][0].capturedAt);
    await page.check('#autoCapture');
    await page.waitForFunction(previous => [...companion.images.values()][0]?.capturedAt !== previous && !companion.busy, firstCapture);
    await page.uncheck('#autoCapture');
    await page.evaluate(id => document.querySelector('[data-act="remove"][data-instance="' + id + '"]').click(), entries[0].id);
    await idle(page);assert.equal(entries[0].page.isClosed(), true);assert.equal(manager.pages.size, 2);
    await page.locator('#urlText').fill(website + '/missing');await page.click('#applyUrlBtn');await idle(page);
    assert.match(await page.locator('.browser-caption').first().textContent(), /HTTP 404/);
    // Restarts reuse the dedicated profile's persistent cookies.
    await page.click('#stopBrowser');await page.waitForFunction(() => !companion.busy);
    assert.equal(manager.context, null);
    await page.locator('#urlText').fill(website);await page.click('#applyUrlBtn');await idle(page);
    for (const entry of manager.pages.values()) assert.equal(await entry.page.locator('h1').textContent(), 'Signed in');
    // Explicit Preview can recover a tab manually closed by the user.
    await [...manager.pages.values()][0].page.close();
    await page.click('#refreshCaptures');await page.waitForFunction(() => !companion.busy);
    assert.match(await page.locator('#companionStatus').textContent(), /attention/);
    await page.click('#applyUrlBtn');await idle(page);
    assert.ok([...manager.pages.values()].every(e => !e.page.isClosed()));
    // Simulate helper loss and verify an honest, recoverable state in the app.
    await page.route('**/api/captures', route => route.abort());
    await page.click('#refreshCaptures');await page.waitForFunction(() => !companion.busy);
    assert.match(await page.locator('#companionStatus').textContent(), /disconnected/);
    await page.unroute('**/api/captures');await page.click('#connectCompanion');await page.waitForFunction(() => !!companion.token && !companion.busy);
    await page.click('#applyUrlBtn');await idle(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();await manager.queue;await manager.stop();
    await close(server);await close(fixture);await rm(profileDir, { recursive: true, force: true });
  }
});
