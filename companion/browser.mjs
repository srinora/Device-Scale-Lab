// SPDX-License-Identifier: GPL-3.0-only
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

export function websiteURL(value) {
  if (typeof value !== 'string' || value.length > 8192) throw Error('Enter an HTTP or HTTPS website URL.');
  let url;
  try { url = new URL(value); } catch { throw Error('Enter an HTTP or HTTPS website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw Error('Use HTTP or HTTPS without credentials in the URL. Sign in in Chrome instead.');
  }
  return url.href;
}

export function validatePages(value) {
  if (!Array.isArray(value) || value.length > 12) throw Error('Select up to 12 devices.');
  const ids = new Set();
  let pixels = 0;
  const pages = value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) {
      throw Error('Device IDs must be valid and unique.');
    }
    ids.add(item.id);
    for (const key of ['width', 'height']) {
      if (!Number.isInteger(item[key]) || item[key] < 1 || item[key] > 8192) throw Error('Browser viewports must be between 1 and 8192 CSS pixels per side.');
    }
    const area = item.width * item.height;
    if (area > 16_777_216) throw Error('A browser viewport supports up to 16 megapixels. Reduce the logical resolution.');
    pixels += area;
    return { id: item.id, width: item.width, height: item.height, url: websiteURL(item.url) };
  });
  if (pixels > 48_000_000) throw Error('The combined browser viewports exceed 48 megapixels. Remove devices or reduce their logical resolution.');
  return pages;
}

async function mapLimited(items, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await callback(items[i]); }
  }));
  return results;
}

export class BrowserCompanion {
  constructor({ profileDir, headless = false, navigationTimeout = 15000 }) {
    this.profileDir = profileDir;
    this.headless = headless;
    this.navigationTimeout = navigationTimeout;
    this.context = null;
    this.pages = new Map();
    this.queue = Promise.resolve();
    this.pending = 0;
  }

  // Serialize sync/capture/reload/stop, including requests from multiple app tabs.
  run(operation) {
    if (this.pending >= 3) return Promise.reject(Error('Browser busy. Wait for the current operation to finish.'));
    this.pending++;
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {}).finally(() => { this.pending--; });
    return result;
  }

  async launch() {
    if (this.context) return;
    await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
    try {
      const context = await chromium.launchPersistentContext(this.profileDir, {
        channel: 'chrome', headless: this.headless, viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1, acceptDownloads: false,
      });
      this.context = context;
      context.on('close', () => {
        if (this.context === context) { this.context = null; this.pages.clear(); }
      });
      this.startPage = context.pages()[0] || null;
    } catch (error) {
      throw Error('Could not start companion Chrome. Install Google Chrome and close any other companion using this profile. ' + error.message.split('\n')[0]);
    }
  }

  describe(entry) {
    const closed = entry.page.isClosed();
    return {
      id: entry.id, width: entry.width, height: entry.height, url: entry.page.url(),
      status: closed || entry.error ? 'error' : 'ready',
      error: closed ? 'This Chrome tab was closed. Click Preview website to reopen it.' : entry.error,
    };
  }

  status() { return { running: !!this.context, pages: [...this.pages.values()].map(e => this.describe(e)) }; }

  async navigate(entry, reload = false) {
    entry.error = '';
    try {
      const options = { waitUntil: 'domcontentloaded', timeout: this.navigationTimeout };
      const response = reload ? await entry.page.reload(options) : await entry.page.goto(entry.requestedUrl, options);
      if (response && response.status() >= 400) entry.error = 'The website returned HTTP ' + response.status() + '.';
    } catch (error) {
      entry.error = error.name === 'TimeoutError'
        ? 'Navigation timed out. Interact in Chrome, then reload or refresh the capture.'
        : 'Navigation failed: ' + error.message.split('\n')[0];
    }
  }

  async sync(specs, force = false) {
    const desired = validatePages(specs);
    if (desired.length) await this.launch();
    const ids = new Set(desired.map(p => p.id));
    for (const [id, entry] of this.pages) {
      if (!ids.has(id)) { await entry.page.close().catch(() => {}); this.pages.delete(id); }
    }
    await mapLimited(desired, async spec => {
      let entry = this.pages.get(spec.id);
      const fresh = !entry || entry.page.isClosed();
      if (fresh) {
        const page = this.startPage && !this.startPage.isClosed() ? this.startPage : await this.context.newPage();
        this.startPage = null;
        entry = { ...spec, page, requestedUrl: '', error: '' };
        page.on('response', response => {
          const request = response.request();
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            if (response.status() >= 400) entry.error = 'The website returned HTTP ' + response.status() + '.';
            else if (response.status() < 300) entry.error = '';
          }
        });
        this.pages.set(spec.id, entry);
      }
      if (fresh || entry.width !== spec.width || entry.height !== spec.height) {
        await entry.page.setViewportSize({ width: spec.width, height: spec.height });
      }
      entry.width = spec.width; entry.height = spec.height;
      if (fresh || force || entry.requestedUrl !== spec.url) {
        entry.requestedUrl = spec.url;
        await this.navigate(entry);
      }
    });
    return this.status();
  }

  async captures() {
    const pages = await mapLimited([...this.pages.values()], async entry => {
      const result = this.describe(entry);
      if (entry.page.isClosed()) return result;
      try {
        const png = await entry.page.screenshot({ type: 'png', timeout: 8000 });
        return { ...result, capturedAt: new Date().toISOString(), image: png.toString('base64') };
      } catch (error) {
        return { ...result, status: 'error', error: 'Capture failed. Check the Chrome tab for a dialog or a closed page. ' + error.message.split('\n')[0] };
      }
    });
    return { running: !!this.context, pages };
  }

  async reload() {
    await mapLimited([...this.pages.values()].filter(e => !e.page.isClosed()), e => this.navigate(e, true));
    return this.status();
  }

  async focus(id) {
    const entry = this.pages.get(id);
    if (!entry || entry.page.isClosed()) throw Error('This browser tab is unavailable. Click Preview website to reopen it.');
    await entry.page.bringToFront();
    return this.describe(entry);
  }

  async stop() {
    const context = this.context;
    this.context = null; this.pages.clear();
    if (context) await context.close();
    return this.status();
  }
}
