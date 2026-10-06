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

test('WoS selecciona pasos completos, alterna el respaldo y amplía la captura actual', async () => {
  await withPage(async page => {
    const tutorial = page.locator('#wallets-wos');
    const steps = tutorial.locator('.wos-steps button');
    const image = tutorial.locator('#wos-step-image');
    const gallery = tutorial.locator('.wos-image-nav');
    const dialog = page.locator('#lightbox');
    const source = () => image.evaluate(el => el.currentSrc);
    assert.equal(await steps.count(), 4);
    assert.equal(await steps.nth(0).getAttribute('aria-pressed'), 'true');
    assert.equal(await tutorial.locator('.wos-steps > li:first-child a').count(), 1, 'Descarga dentro del primer paso');
    assert(await gallery.isHidden());
    const sources = new Set();
    for (let index = 0; index < await steps.count(); index++) {
      const step = steps.nth(index);
      const box = await step.boundingBox();
      await step.click({ position: { x: box.width - 8, y: 8 } });
      await image.evaluate(el => el.decode());
      assert.equal(await tutorial.locator('.wos-steps button[aria-pressed="true"]').count(), 1);
      assert.equal(await step.getAttribute('aria-pressed'), 'true');
      sources.add(await source());
      assert((await image.getAttribute('alt')).trim());
      assert(await gallery.isVisible() === (index === await steps.count() - 1));
    }
    assert.equal(sources.size, await steps.count(), 'Cada paso cambia la captura');
    const first = await source();
    await gallery.getByRole('button', { name: 'Captura siguiente', exact: true }).click();
    await image.evaluate(el => el.decode());
    const second = await source();
    assert.notEqual(second, first);
    assert.match(await gallery.textContent(), /2\s*\/\s*2/);
    await image.focus();
    await page.keyboard.press('Enter');
    assert(await dialog.evaluate(el => el.open));
    assert.equal(await dialog.locator('.lightbox-img').getAttribute('src'), second);
    assert.equal(await dialog.locator('.lightbox-img').getAttribute('alt'), await image.getAttribute('alt'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#lightbox').open);
    assert(await image.evaluate(el => document.activeElement === el));
    await gallery.getByRole('button', { name: 'Captura anterior', exact: true }).click();
    await image.evaluate(el => el.decode());
    assert.equal(await source(), first);
    await gallery.getByRole('button', { name: 'Captura siguiente', exact: true }).click();
    await steps.nth(2).click();
    assert(await gallery.isHidden());
    await steps.nth(3).focus();
    await page.keyboard.press('Space');
    await image.evaluate(el => el.decode());
    assert.equal(await source(), first, 'Volver al paso reinicia la galería');
    assert.match(await gallery.textContent(), /1\s*\/\s*2/);
  });
});

test('red y video se amplían por separado, siguen animados y vuelven a su lugar', async () => {
  await withPage(async page => {
    await page.locator('#lightning-rutas').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
    const video = page.locator('#ln-video');
    const dialog = page.locator('#lightbox');
    assert(await video.evaluate(el => el.paused), 'Movimiento reducido pausa el video');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !document.querySelector('#ln-video').paused);
    const trail = await page.locator('#ln-trail').getAttribute('d');
    await page.waitForFunction(previous => document.querySelector('#ln-trail').getAttribute('d') !== previous, trail, { timeout: 6000 });
    for (const mediaID of ['ln-net', 'ln-video']) {
      const media = page.locator('#' + mediaID);
      const stage = media.locator('..');
      const originalStage = await stage.elementHandle();
      const originalParent = await stage.evaluate(el => el.parentElement.className);
      await stage.focus();
      await page.keyboard.press('Enter');
      assert(await dialog.evaluate(el => el.open));
      assert.equal(await dialog.locator('svg, video').count(), 1, 'Solo se amplía la escena elegida');
      assert.equal(await dialog.locator('#' + mediaID).count(), 1);
      assert(await page.evaluate(el => document.querySelector('#lightbox .ln-stage') === el, originalStage), 'Se mueve el original, no una copia');
      const time = await video.evaluate(el => el.currentTime);
      await page.waitForFunction(previous => {
        const video = document.querySelector('#ln-video');
        return !video.paused && video.currentTime !== previous;
      }, time);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('#ln-video').paused);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#lightbox').open);
      assert.equal(await stage.evaluate(el => el.parentElement.className), originalParent);
      assert(await stage.evaluate(el => document.activeElement === el), 'El foco vuelve a la escena');
      assert.equal(await page.locator('#' + mediaID).count(), 1);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => !document.querySelector('#ln-video').paused);
    }
    await page.locator('#wallets-wos').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('#ln-video').paused);
  });
});

test('Cashu se despliega con teclado, gira la flecha y las comparaciones abren independientemente', async () => {
  await withPage(async page => {
    const route = page.locator('.cashu-route');
    const summary = route.locator('summary');
    const angle = () => summary.evaluate(el => {
      const matrix = new DOMMatrix(getComputedStyle(el, '::before').transform);
      return Math.atan2(matrix.b, matrix.a);
    });
    assert.equal(await route.evaluate(el => el.open), false);
    assert.equal(await angle(), 0);
    assert.equal(await route.locator('..').evaluate(el => getComputedStyle(el, '::before').display), 'none', 'Sin guion adicional');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert(await route.evaluate(el => el.open));
    await summary.scrollIntoViewIfNeeded();
    await page.waitForFunction(el => new DOMMatrix(getComputedStyle(el, '::before').transform).b > .99, await summary.elementHandle(), { timeout: 2000 });
    const openedAngle = await angle();
    assert(Math.abs(openedAngle - Math.PI / 2) < .01, 'La flecha apunta hacia abajo');
    assert(await route.locator('ol').isVisible());
    const mint = new URL((await route.locator('code').textContent()).trim());
    assert.equal(mint.protocol, 'https:');
    assert(mint.pathname !== '/', 'Debe ser el endpoint de la mint, no solo su sitio web');
    await page.keyboard.press('Space');
    assert.equal(await route.evaluate(el => el.open), false);
    assert(await route.locator('ol').isHidden());
    const wallets = page.locator('.wallet-option');
    for (const wallet of await wallets.all()) {
      const summary = wallet.locator('summary');
      if (await wallet.evaluate(el => el.open)) await summary.click();
      await summary.focus();
      await page.keyboard.press('Enter');
      assert(await wallet.evaluate(el => el.open));
      assert(await wallet.locator('.pros-cons').isVisible());
    }
    assert.equal(await page.locator('.wallet-option[open]').count(), await wallets.count(), 'Abrir una no cierra las otras');
  });
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

test('los badges distinguen custodia, progresión y código en cada wallet destacada', async () => {
  await withPage(async page => {
    const rgb = badge => badge.evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
    for (const badge of await page.locator('.claim-tag.is-custody, .claim-tag.is-mixed span:first-child').all()) {
      const color = await rgb(badge);
      assert(Math.max(...color) - Math.min(...color) < 20, 'Custodial en gris');
    }
    for (const badge of await page.locator('.claim-tag.is-self, .claim-tag.is-mixed span:last-child').all()) {
      const [red, green, blue] = await rgb(badge);
      assert(red > green && green > blue, 'Autocustodial en naranja');
    }
    for (const badge of await page.locator('.claim-tag.is-progressive').all()) {
      assert((await badge.evaluate(el => getComputedStyle(el).backgroundImage)).startsWith('linear-gradient('));
      assert((await badge.evaluate(el => getComputedStyle(el, '::before').backgroundImage)).startsWith('linear-gradient('), 'También el borde tiene gradiente');
    }
    const featured = page.locator('.app-copy:has(.app-logo)');
    assert(await featured.count() > 0);
    for (const wallet of await featured.all()) {
      const code = wallet.locator('.claim-tag.is-open, .claim-tag.is-closed');
      assert.equal(await code.count(), 1, 'Cada wallet tiene un badge de código');
      const [red, green] = await rgb(code);
      const label = await code.textContent();
      assert(label.includes('abierto') ? green > red : red > green, 'Código abierto verde; cerrado rojo');
      assert(await code.isVisible());
    }
  });
});

test('abrir Cashu reemplaza la captura de ZEUS por un video controlable y cerrar lo pausa', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const zeus = page.locator('#wallets-zeus');
      const summary = zeus.locator('.cashu-route summary');
      const image = zeus.locator('.app-shot img');
      const video = zeus.locator('.app-shot video');
      assert.equal(await video.count(), 1, 'La demo debe estar disponible en la sección ZEUS');
      assert(await image.isVisible());
      assert(await video.isHidden(), 'Sin mostrar el video antes de abrir la configuración');
      await summary.click();
      await video.waitFor({ state: 'visible' });
      assert(await image.isHidden());
      assert(await video.isVisible());
      assert(await video.evaluate(el => el.controls && el.playsInline && !el.autoplay && el.paused), 'Controles nativos, sin autoplay');
      await video.evaluate(el => el.play());
      await page.waitForFunction(() => {
        const video = document.querySelector('#wallets-zeus .app-shot video');
        return video.videoWidth > 0 && video.currentTime > 0 && !video.paused;
      });
      const box = await video.boundingBox();
      assert(box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1, 'Video dentro de la pantalla');
      await summary.click();
      await image.waitFor({ state: 'visible' });
      assert(await image.isVisible());
      assert(await video.isHidden());
      assert(await video.evaluate(el => el.paused), 'No dejar audio o reproducción escondidos');
      await summary.click();
      await video.waitFor({ state: 'visible' });
      assert(await video.isVisible());
      assert(await video.evaluate(el => el.paused), 'Reabrir no inicia reproducción automática');
    }, { viewport: { width, height: 844 } });
  }
});

test('la demo de Cashu ocupa más espacio sin agrandar la captura ni salir de los márgenes', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const zeus = page.locator('#wallets-zeus');
      const figure = zeus.locator('.app-shot');
      const closed = await figure.boundingBox();
      await zeus.locator('.cashu-route summary').click();
      const video = figure.locator('video');
      await video.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#wallets-zeus video').videoWidth > 0);
      await page.waitForFunction(previous => document.querySelector('#wallets-zeus .app-shot').getBoundingClientRect().width > previous * 1.1, closed.width, { timeout: 2000 });
      const box = await video.boundingBox();
      const container = await figure.boundingBox();
      const margins = await zeus.locator('.chapter-inner').boundingBox();
      assert(container.width > closed.width * 1.1, `${width}px: video mayor que la captura cerrada (${container.width} > ${closed.width})`);
      assert(box.height > 844 * (width > 1000 ? .78 : .62), 'Video más alto que el tamaño anterior');
      assert(container.x >= margins.x - 1 && container.x + container.width <= margins.x + margins.width + 1, 'Respetar márgenes');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await zeus.locator('.cashu-route summary').click();
      await figure.locator('img').waitFor({ state: 'visible' });
      await page.waitForFunction(previous => document.querySelector('#wallets-zeus .app-shot').getBoundingClientRect().width === previous, closed.width, { timeout: 2000 });
      assert.equal((await figure.boundingBox()).width, closed.width, 'La captura conserva su tamaño');
    }, { viewport: { width, height: 844 } });
  }
});

test('la guía visible de Cashu sigue el asistente de creación mostrado en la demo', async () => {
  await withPage(async page => {
    const route = page.locator('.cashu-route');
    await route.locator('summary').click();
    const steps = route.locator('ol > li');
    const actions = [
      /Empezar.*Repase el cuestionario/is,
      /Tarifas bajas.*Cashu ecash/is,
      /LDK Node.*velocidad y fiabilidad/is,
      /Cuentas seguidas por ZEUS en Nostr.*Seleccionar/is,
      /Crear billetera.*sincroniz/is,
    ];
    assert.equal(await steps.count(), actions.length, 'La guía cubre la creación observada, no otro flujo de ajustes');
    for (let index = 0; index < actions.length; index++) {
      assert(await steps.nth(index).isVisible());
      assert.match(await steps.nth(index).innerText(), actions[index], `Paso ${index + 1}: acciones en el orden de la demo`);
    }
    assert.match(await route.innerText(), /Minibits/);
    assert(await route.locator('code').isVisible(), 'Conservar la URL de referencia de la mint');
  });
});
