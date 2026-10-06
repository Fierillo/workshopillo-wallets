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

test('los badges de código conservan su color aunque cambie el enlace a la fuente', async () => {
  await withPage(async page => {
    await page.addStyleTag({ content: 'a { transition: none !important; }' });
    const badges = page.locator('.wallet-option-code');
    assert(await badges.count() > 0);
    for (const badge of await badges.all()) {
      const label = (await badge.textContent()).trim();
      const before = await badge.evaluate(el => getComputedStyle(el).color);
      const [red, green] = before.match(/\d+/g).map(Number);
      assert(label === 'Abierto' ? green > red : red > green, `${label}: color incorrecto`);
      await badge.evaluate(el => { el.href = 'https://codeberg.org/example/wallet'; });
      assert.equal(await badge.evaluate(el => getComputedStyle(el).color), before, 'La clasificación depende del código, no del dominio de la referencia');
    }
  });
});

test('el ábaco mueve fichas independientes sin atravesar nodos y actualiza cada paso', async () => {
  await withPage(async page => {
    const button = page.locator('#ab-send');
    const readBalances = () => page.locator('.ab-balance').evaluateAll(elements => elements.map(el => parseInt(el.textContent)));
    const initial = await readBalances();
    const shapes = await page.locator('#ab-network > g:nth-child(2) > circle').evaluateAll(elements => elements.map(el => ({ x: el.cx.baseVal.value, y: el.cy.baseVal.value, radius: el.r.baseVal.value })));
    const beadRows = await page.locator('.ab-channel').evaluateAll(channels => channels.map(channel => [...channel.querySelectorAll('circle')].map(bead => ({ x: bead.cx.baseVal.value, y: bead.cy.baseVal.value }))));
    assert.equal(initial.length, 4);
    assert.equal(beadRows.length, initial.length - 1);
    assert(beadRows.every(row => row.length > 1 && row.every(bead => bead.y === row[0].y)));
    assert.equal(initial.reduce((a, b) => a + b), beadRows.flat().length * 10);
    const status = await page.locator('#ab-status').textContent();
    const moving = page.locator('.ab-channel circle[fill="#ff762e"]');
    const positions = () => moving.evaluateAll(elements => elements.map(el => ({ x: el.cx.baseVal.value, y: el.cy.baseVal.value, radius: el.r.baseVal.value })));
    const original = await positions();
    const channelEnds = await page.locator('.ab-channel path').evaluateAll(paths => paths.map(path => path.getPointAtLength(path.getTotalLength()).x));
    await button.click();
    assert(await button.isDisabled());
    const states = [initial];
    let sawMovement = false;
    for (let tick = 0; tick < 15; tick++) {
      await page.clock.runFor(300);
      const now = await positions();
      const totals = await readBalances();
      assert.equal(totals.reduce((a, b) => a + b), initial.reduce((a, b) => a + b), 'Se conserva el total');
      if (JSON.stringify(states.at(-1)) !== JSON.stringify(totals)) states.push(totals);
      now.forEach((bead, index) => {
        assert.equal(bead.y, original[index].y);
        assert(bead.x >= original[index].x);
        assert(bead.x <= channelEnds[index], 'La ficha se queda dentro de su canal, también ante el local');
        for (const node of shapes) assert(Math.hypot(bead.x - node.x, bead.y - node.y) >= node.radius + bead.radius, 'Las fichas nunca atraviesan los nodos');
        if (bead.x !== original[index].x) sawMovement = true;
        if (index > 0 && bead.x !== original[index].x) {
          for (let node = 0; node < index; node++) {
            assert.equal(totals[node], initial[node] - (node === 0 ? 10 : 0), 'El siguiente canal espera a que el anterior termine');
          }
        }
      });
    }
    assert(sawMovement, 'Debe verse movimiento real');
    const expected = [initial];
    for (let channel = 0; channel < beadRows.length; channel++) {
      const totals = [...expected.at(-1)];
      totals[channel] -= 10;
      totals[channel + 1] += 10;
      expected.push(totals);
    }
    assert.deepEqual(states, expected, 'Cada llegada actualiza los dos vecinos antes del siguiente salto');
    assert(await button.isEnabled());
    assert.notEqual(await page.locator('#ab-status').textContent(), status);
    assert.equal(expected.at(-1)[1], initial[1]);
    assert.equal(expected.at(-1)[2], initial[2]);
    await button.click();
    assert.deepEqual(await readBalances(), initial, 'Repetir reinicia el ejemplo, no acumula pagos');
    await page.clock.runFor(4500);
    assert.deepEqual(await readBalances(), expected.at(-1));
  }, { clock: true, reducedMotion: 'no-preference' });
});

test('movimiento reducido permite completar el pago sin animación y detiene el tambor', async () => {
  await withPage(async page => {
    const ring = page.locator('#drum-ring');
    const rotation = () => ring.evaluate(el => el.style.getPropertyValue('--rot'));
    const frozen = await rotation();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(previous => document.querySelector('#drum-ring').style.getPropertyValue('--rot') !== previous, frozen);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#drum-ring').style.getPropertyValue('--rot') === '0deg');
    await page.locator('#ab-send').click();
    await page.waitForFunction(() => !document.querySelector('#ab-send').disabled);
    const totals = await page.locator('.ab-balance').evaluateAll(elements => elements.map(el => parseInt(el.textContent)));
    assert.equal(totals[1], totals[2]);
    assert.equal(totals.at(-1) - totals[0], 20, 'El ejemplo completa un pago de diez sats');
    assert.equal(await rotation(), '0deg');
    assert(await page.locator('#ln-video').evaluate(el => el.paused));
  });
});
