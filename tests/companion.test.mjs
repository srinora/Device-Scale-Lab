// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCompanionServer } from '../companion/server.mjs';
import { BrowserCompanion, validatePages, websiteURL } from '../companion/browser.mjs';

test('navigation validation accepts websites and rejects non-web protocols, credentials, duplicates and oversized viewports', () => {
  assert.equal(websiteURL('https://www.apple.com'), 'https://www.apple.com/');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.com', 'invalid']) assert.throws(() => websiteURL(url));
  const page = { id: 'test', width: 375, height: 667, url: 'http://localhost:9999/' };
  assert.deepEqual(validatePages([page]), [page]);
  for (const values of [[page, page], [{ ...page, width: Infinity }], [{ ...page, height: 0 }], [{ ...page, width: 300.5 }], [{ ...page, width: 8193 }], [{ ...page, width: 8192, height: 8192 }], Array.from({ length: 13 }, (_, i) => ({ ...page, id: String(i) }))]) assert.throws(() => validatePages(values));
});

test('browser operations serialize without overlap and recover after failure', async () => {
  const manager = new BrowserCompanion({ profileDir: '/unused-in-this-test' });
  const order = [];
  const a = manager.run(async () => { order.push('start'); await new Promise(r => setTimeout(r, 15)); order.push('end'); throw Error('expected'); });
  const b = manager.run(() => { order.push('next'); return 'ok'; });
  await assert.rejects(a, /expected/);assert.equal(await b, 'ok');
  assert.deepEqual(order, ['start', 'end', 'next']);
});

test('local API requires same origin and session token; profile and source files are not served', async t => {
  const calls = [];
  const manager = { run: fn => fn(), status: () => ({ running: false, pages: [] }), sync: (pages, force) => { calls.push({ pages, force }); return { running: true, pages: [] }; } };
  const { server } = createCompanionServer({ manager });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); return new Promise(r => server.close(r)); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const headers = { Origin: origin, 'X-DeviceScale-Client': '1' };
  assert.equal((await fetch(origin + '/')).status, 200);
  for (const extra of [{}, { Origin: 'https://evil.invalid', 'X-DeviceScale-Client': '1' }, { Origin: 'null', 'X-DeviceScale-Client': '1' }]) {
    assert.equal((await fetch(origin + '/api/session', { headers: extra })).status, 403);
  }
  const session = await (await fetch(origin + '/api/session', { headers })).json();
  assert.equal(session.protocol, 1);
  for (const token of ['', 'bad', 'é'.repeat(64)]) {
    assert.equal((await fetch(origin + '/api/status', { headers: { ...headers, 'X-DeviceScale-Token': token } })).status, 403);
  }
  headers['X-DeviceScale-Token'] = session.token;
  assert.equal((await fetch(origin + '/api/status', { headers })).status, 200);
  const post = body => fetch(origin + '/api/sync', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ pages: [{ id: 'a', width: 375, height: 667, url: 'file:///tmp/a' }] })).status, 400);
  assert.equal((await post({ pages: [{ id: 'a', width: 375, height: 667, url: origin }] })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await post({ pages: [{ id: 'a', width: 375, height: 667, url: 'https://example.com' }], force: true })).status, 200);
  assert.equal(calls.length, 1);assert.equal(calls[0].force, true);
  for (const pathname of ['/.devicescale-browser/Default/Cookies', '/companion/server.mjs', '/package.json', '/../package.json']) {
    assert.equal((await fetch(origin + pathname)).status, 404);
  }
  const crossOrigin = await fetch(origin + '/api/session', { method: 'OPTIONS', headers: { Origin: 'https://evil.invalid', 'Access-Control-Request-Headers': 'x-devicescale-client' } });
  assert.equal(crossOrigin.status, 403);assert.equal(crossOrigin.headers.get('access-control-allow-origin'), null);
  const wrongHostStatus = await new Promise((resolve, reject) => {
    http.get(origin, { headers: { Host: 'evil.invalid' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
});
