// SPDX-License-Identifier: GPL-3.0-only
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BrowserCompanion, validatePages } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sameToken = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };

async function readBody(req) {
  if (req.headers['content-type'] !== 'application/json') throw Error('Send JSON requests.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 128 * 1024) throw Error('Request too large.');
  }
  try { return JSON.parse(body); } catch { throw Error('Invalid JSON request.'); }
}

export function createCompanionServer({ manager = new BrowserCompanion({ profileDir: path.join(root, '.devicescale-browser') }) } = {}) {
  const token = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = '127.0.0.1:' + server.address().port, origin = 'http://' + host;
    if (req.headers.host !== host) return json(res, 403, { error: 'Invalid local host.' });
    const pathname = new URL(req.url, origin).pathname;
    if (pathname.startsWith('/api/')) {
      // Custom header forces cross-origin preflight; no CORS permission is granted.
      const fromApp = req.headers.origin === origin || (!req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin');
      if (!fromApp || req.headers['x-devicescale-client'] !== '1') return json(res, 403, { error: 'Open the local companion app to connect.' });
      if (pathname === '/api/session' && req.method === 'GET') return json(res, 200, { protocol: 1, token });
      if (!sameToken(req.headers['x-devicescale-token'], token)) return json(res, 403, { error: 'Companion session expired. Click Connect to reconnect.' });
      try {
        if (pathname === '/api/status' && req.method === 'GET') return json(res, 200, manager.status());
        if (req.method !== 'POST') return json(res, 405, { error: 'Unsupported method.' });
        const body = await readBody(req);
        let operation;
        if (pathname === '/api/sync') {
          const pages = validatePages(body.pages);
          if (body.force !== undefined && typeof body.force !== 'boolean') throw Error('Invalid navigation option.');
          for (const page of pages) {
            const url = new URL(page.url);
            if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === String(server.address().port)) throw Error('Choose a website other than the companion app.');
          }
          operation = () => manager.sync(pages, body.force === true);
        } else if (pathname === '/api/captures') operation = () => manager.captures();
        else if (pathname === '/api/reload') operation = () => manager.reload();
        else if (pathname === '/api/focus') operation = () => manager.focus(body.id);
        else if (pathname === '/api/stop') operation = () => manager.stop();
        else return json(res, 404, { error: 'Unknown companion action.' });
        return json(res, 200, await manager.run(operation));
      } catch (error) { return json(res, 400, { error: error.message }); }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Unsupported method.' });
    const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/README.md': ['README.md', 'text/plain'], '/LICENSE': ['LICENSE', 'text/plain'] };
    const file = files[pathname];
    if (!file) return json(res, 404, { error: 'Not found.' });
    try {
      const contents = await readFile(path.join(root, file[0]));
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch { json(res, 500, { error: 'Could not read the application file.' }); }
  });
  return { server, manager };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, manager } = createCompanionServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Port 8765 is already in use. Stop the other server, then run npm start again.'
      : 'Companion could not start: ' + error.message);
    process.exitCode = 1;
  });
  server.listen(8765, '127.0.0.1', () => console.log('DeviceScale Lab companion: http://127.0.0.1:8765\nOpen that address, choose URL → Browser companion, then Preview website.'));
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    server.close();
    await manager.queue;
    await manager.stop();
    server.closeAllConnections();
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
