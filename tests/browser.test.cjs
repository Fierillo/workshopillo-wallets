const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright-core');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let browser, server, baseURL;

before(async () => {
  server = createServer(async (request, response) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const types = { '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };
      let contents = await readFile(file);
      if (file === path.join(root, 'index.html') && process.env.REGRESSION_MUTATION) {
        contents = require('./mutations.cjs').mutate(contents.toString(), process.env.REGRESSION_MUTATION);
      }
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range && Buffer.isBuffer(contents)) {
        const start = Number(range[1]);
        const end = Math.min(range[2] ? Number(range[2]) : contents.length - 1, contents.length - 1);
        if (start > end) {
          response.writeHead(416, { 'Content-Range': `bytes */${contents.length}` }).end();
          return;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${contents.length}`;
        const chunk = contents.subarray(start, end + 1);
        response.writeHead(206, { ...headers, 'Content-Length': chunk.length });
        response.end(chunk);
      } else {
        response.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(contents) });
        response.end(contents);
      }
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function withPage(run, options = {}) {
  const { clock = false, ...contextOptions } = options;
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce', ...contextOptions });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/assets/') && response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  try {
    if (clock) {
      await page.clock.install();
      await page.clock.pauseAt(new Date());
    }
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await run(page);
    assert.deepEqual(errors, [], 'No debe haber errores de JavaScript');
  } finally {
    await page.close();
  }
}
