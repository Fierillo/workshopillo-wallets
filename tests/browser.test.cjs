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
  const { clock = false, minimumFontSize = 0, ...contextOptions } = options;
  const testBrowser = minimumFontSize ? await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: [`--blink-settings=minimumFontSize=${minimumFontSize}`],
  }) : browser;
  const page = await testBrowser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce', ...contextOptions });
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
    if (testBrowser !== browser) await testBrowser.close();
  }
}

async function goToPage(page, hash) {
  const link = page.locator(`.chapter-nav a[href="${hash}"]`);
  if (await link.isVisible()) await link.click();
  else await page.locator(hash).evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
  await page.waitForFunction(hash => document.querySelector('.chapter-nav a[aria-current]')?.hash === hash, hash);
}

test('la portada conserva el título anterior como subtítulo, sin atajo al taller ni Cash App en el carrusel y la tabla', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#inicio');
      const hero = page.locator('#inicio');
      const title = hero.getByRole('heading', { level: 1 });
      assert.equal(await title.innerText(), 'Bitcoin no es caro, ni lento, y te lo voy a demostrar');
      const subtitle = hero.locator('.hero-copy > p').filter({ hasText: 'Bitcoin se entiende mejor cuando lo usás.' });
      assert(await subtitle.isVisible(), 'Conservar el título anterior como subtítulo');
      assert.equal(await hero.getByRole('link', { name: /taller/i }).count(), 0);
      assert(await hero.getByRole('link', { name: /Empezar el recorrido/ }).isVisible());
      const cards = hero.locator('.drum-card');
      const names = await cards.locator('strong').allTextContents();
      assert.equal(names.length, 12);
      assert(!names.includes('Cash App'));
      assert.equal((await hero.locator('.wallet-count').innerText()).trim(), '01 — 12');
      assert.deepEqual(await cards.evaluateAll(elements => elements.map(el => Number(getComputedStyle(el).getPropertyValue('--i')))), Array.from({ length: 12 }, (_, i) => i), 'Sin huecos en el carrusel');
      assert.equal(await cards.first().evaluate(el => Number(getComputedStyle(el).getPropertyValue('--n'))), 12, 'Ángulos calculados para doce wallets');
      await goToPage(page, '#wallets-tabla');
      const tableNames = await page.locator('.wallet-option-name').allTextContents();
      assert.deepEqual(tableNames, names, 'Carrusel y tabla conservan las mismas wallets y su orden');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('después de La Crypta se puede abrir el workshop desde un slide con QR legible', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      assert.equal(await page.locator('#lacrypta + section').getAttribute('id'), 'workshop-acceso', 'El acceso al workshop sigue inmediatamente a La Crypta');
      await goToPage(page, '#lacrypta');
      await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => document.querySelector('.chapter-nav a[aria-current]')?.hash === '#workshop-acceso');
      const slide = page.locator('#workshop-acceso');
      assert(await slide.getByRole('heading', { name: 'Seguí el workshop desde tu celu.' }).isVisible());
      const link = slide.getByRole('link', { name: 'workshop.fierillo.world', exact: true });
      assert(await link.isVisible());
      assert.equal(await link.getAttribute('href'), 'https://workshop.fierillo.world');
      const qr = slide.getByRole('img', { name: 'QR para abrir https://workshop.fierillo.world' });
      assert(await qr.isVisible());
      assert(await qr.evaluate(el => el.complete && el.naturalWidth > 0), 'QR local cargado');
      const box = await qr.boundingBox();
      assert(box.width >= 240 && Math.abs(box.width - box.height) < 1, 'QR grande y cuadrado');
      assert(box.x >= 0 && box.x + box.width <= width, 'QR dentro de la pantalla');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('la tabla pregunta por LN Address, claves y código con badges compactos y desarrolla cada respuesta al abrir', async () => {
  const expectedAddress = ['LN Address personalizada', 'LN Address asignada', 'LN Address personalizada', 'LN Address personalizada', 'LN Address personalizada', 'LN Address asignada', 'Sin LN Address', 'Sin LN Address', 'LN Address personalizada', 'Sin LN Address', 'LN Address asignada', 'LN Address asignada'];
  for (const width of [1366, 1024, 768, 621, 620, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-tabla');
      const table = page.locator('#wallets-tabla');
      assert.deepEqual(await table.locator('.comparison-head span').allTextContents(), ['Wallet', '¿Tiene LN Address?', '¿Quién tiene las claves?', '¿El código es abierto?']);
      const wallets = table.locator('.wallet-option');
      assert.equal(await wallets.count(), expectedAddress.length);
      const heights = [];
      for (let index = 0; index < await wallets.count(); index++) {
        const wallet = wallets.nth(index);
        const summary = wallet.locator('summary');
        if (await wallet.evaluate(el => el.open)) await summary.click();
        const badges = summary.locator('.claim-tag');
        heights.push((await summary.boundingBox()).height);
        assert.equal(await badges.count(), 3, 'Tres respuestas compactas por wallet');
        assert.equal(await badges.first().textContent(), expectedAddress[index]);
        const custody = summary.locator('.wallet-option-custody');
        assert.equal((await custody.textContent()).replace(/\s+/g, ' '), ['Autocustodia progresiva', 'Custodial / Autocustodial', 'Autocustodial', 'Custodial', 'Custodial / Autocustodial', 'Autocustodial', 'Autocustodial', 'Autocustodial', 'Autocustodial', 'Custodial / Autocustodial', 'Autocustodia progresiva', 'Autocustodial'][index], 'Custodia con su etiqueta completa');
        assert.match(await summary.locator('.wallet-option-code').innerText(), /^Código (abierto|cerrado)$/i, 'Código con su etiqueta completa');
        assert(await summary.locator('.wallet-option-custody.claim-tag').isVisible());
        for (const badge of await badges.all()) {
          assert(await badge.isVisible());
          const box = await badge.boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width + 1, 'Badge dentro de los márgenes');
          assert(box.height <= 26, 'Badge compacto, de una sola línea');
          assert(await badge.evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return text.x >= box.x && text.right <= box.right && text.y >= box.y && text.bottom <= box.bottom;
          }), `Sin recortar ni desbordar texto del badge: ${width}px, ${await badge.textContent()}`);
        }
        const explanation = wallet.locator('.wallet-explanation');
        assert(await explanation.isHidden(), 'Solo badges al cerrar');
        await summary.focus();
        await page.keyboard.press('Enter');
        assert(await explanation.isVisible());
        assert.equal(await explanation.locator('p').count(), 3, 'Desarrolla las tres respuestas');
        const text = await explanation.innerText();
        assert.match(text, /¿Tiene LN Address\?/);
        assert.match(text, /¿Quién tiene las claves\?/);
        assert.match(text, /¿El código es abierto\?/);
        assert(await wallet.locator('.pros-cons').isVisible(), 'Conserva ventajas y límites');
        if (index === 5) assert.match(text, /BIP353.*BOLT12/is);
        if (index === 9) assert.match(text, /servicio.*conect/is);
        if (index === 11) assert.match(text, /JAN3.*L-BTC/is);
        await page.keyboard.press('Enter');
        assert(await explanation.isHidden());
      }
      assert(Math.max(...heights) - Math.min(...heights) < 1, 'Todas las entradas cerradas tienen el mismo grosor');
      assert(Math.max(...heights) <= (width <= 620 ? 146 : 66), 'Filas compactas en escritorio y móvil');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('el texto completo de cada badge queda dentro de su área interior y de su columna al redimensionar la tabla', async () => {
  await withPage(async page => {
    await goToPage(page, '#wallets-tabla');
    await page.evaluate(() => document.fonts.ready);
    const allFailures = [];
    for (const width of [320, 360, 390, 480, 620, 621, 640, 680, 720, 768, 800, 850, 900, 960, 1024, 1100, 1280, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const failures = await page.locator('.wallet-option summary .claim-tag').evaluateAll(badges => badges.flatMap(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
        const bottom = box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom);
        const summary = el.closest('summary');
        const grid = getComputedStyle(summary);
        const tracks = grid.gridTemplateColumns.split(' ').map(Number.parseFloat);
        const column = tracks.length === 3 ? 1 : el.classList.contains('wallet-option-address') ? 2 : el.classList.contains('wallet-option-custody') ? 3 : 4;
        const columnLeft = summary.getBoundingClientRect().left + parseFloat(grid.borderLeftWidth) + parseFloat(grid.paddingLeft) + tracks.slice(0, column).reduce((sum, size) => sum + size, 0) + column * parseFloat(grid.columnGap);
        const siblings = [...summary.querySelectorAll('.claim-tag')].filter(other => other !== el);
        const overlaps = siblings.some(other => {
          const rect = other.getBoundingClientRect();
          return box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
        });
        const errors = [];
        if (text.left < left - .5 || text.right > right + .5 || text.top < top - .5 || text.bottom > bottom + .5) errors.push('texto fuera del área interior');
        if (el.scrollWidth > el.clientWidth) errors.push('overflow horizontal');
        if (range.getClientRects().length !== 1) errors.push('más de una línea');
        if (overlaps) errors.push('solapamiento entre badges');
        if (box.left < columnLeft - .5 || box.right > columnLeft + tracks[column] + .5) errors.push('badge fuera de su columna');
        return errors.length ? [{ wallet: summary.querySelector('.wallet-option-name').textContent, badge: el.textContent, errors }] : [];
      }));
      if (failures.length) allFailures.push({ width, failures });
      const headingFailures = await page.locator('.comparison-head span').evaluateAll(headings => headings.flatMap(el => {
        const box = el.getBoundingClientRect();
        if (!box.width) return [];
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        return range.getClientRects().length !== 1 || text.left < box.left - .5 || text.right > box.right + .5 ? [el.textContent] : [];
      }));
      if (headingFailures.length) allFailures.push({ width, headingFailures });
    }
    assert.deepEqual(allFailures, [], 'Badges contenidos al redimensionar');
  });
});

test('la última columna y los badges siguen contenidos con fuente mínima de navegador de 16px', async () => {
  await withPage(async page => {
    await goToPage(page, '#wallets-tabla');
    for (const width of [1366, 1571, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('.wallet-option-code').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'Fuente mínima real de Chromium');
      const failures = await page.locator('.comparison-head span, .wallet-option summary .claim-tag').evaluateAll(elements => elements.flatMap(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const failures = [];
        if (range.getClientRects().length !== 1) failures.push('texto en varias líneas');
        if (text.left < box.left + parseFloat(style.paddingLeft) - .5 || text.right > box.right - parseFloat(style.paddingRight) + .5) failures.push('texto fuera del badge o columna');
        const row = el.closest('summary, .comparison-head');
        const rowBox = row.getBoundingClientRect();
        if (box.right > rowBox.right - parseFloat(getComputedStyle(row).paddingRight) + .5) failures.push('fuera de la fila');
        const others = [...row.children].filter(other => other !== el);
        if (others.some(other => {
          const rect = other.getBoundingClientRect();
          return box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
        })) failures.push('solapamiento con otra celda');
        if (el.matches('.claim-tag')) {
          const after = getComputedStyle(row, '::after');
          const plusLeft = rowBox.right - parseFloat(getComputedStyle(row).paddingRight) - 18;
          if (after.content !== 'none' && box.right > plusLeft - parseFloat(getComputedStyle(row).columnGap) + .5) failures.push('invade el botón de apertura');
        }
        return failures.length ? [{ label: el.textContent, failures }] : [];
      }));
      assert.deepEqual(failures, [], `Columnas contenidas con fuente mínima a ${width}px`);
    }
  }, { minimumFontSize: 16 });
});

test('Tether introduce Spark y el esquema continúa debajo de su introducción sin comprimir el contenido', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-tether');
      const tether = page.locator('#wallets-tether');
      assert.match(await tether.locator('.app-lines').innerText(), /Lightning vía Spark/);
      assert.equal(await tether.evaluate(el => el.nextElementSibling.id), 'wallets-spark', 'Spark inmediatamente después de Tether');
      await goToPage(page, '#wallets-spark');
      const spark = page.locator('#wallets-spark');
      assert(await spark.getByRole('heading', { name: '¿Dijiste Spark? ¿Que es eso?', exact: true }).isVisible());
      assert.equal(await spark.locator('.eyebrow').count(), 0, 'Sin antetítulo adicional');
      assert(await spark.locator('#spark-title').evaluate(el => getComputedStyle(el).color === getComputedStyle(document.body).color), 'Título blanco como el resto de la presentación');
      assert(await spark.locator('#spark-title').evaluate((el, minimum) => parseFloat(getComputedStyle(el).fontSize) >= minimum, width === 1366 ? 36 : 28), 'Título de Spark un poco más grande en escritorio y móvil');
      assert.equal(await spark.evaluate(el => el.nextElementSibling.id), 'wallets-spark-funcionamiento', 'El esquema continúa debajo de la introducción');
      assert.equal(await spark.locator('figure').count(), 0, 'No comprimir el esquema junto a la introducción');
      await goToPage(page, '#wallets-spark-funcionamiento');
      const explanation = page.locator('#wallets-spark-funcionamiento');
      assert(await explanation.getByRole('heading', { name: '¿Cómo funciona Spark?', exact: true }).isVisible());
      assert(await explanation.locator('h3').evaluate(el => getComputedStyle(el).color === getComputedStyle(document.body).color), 'El título del esquema también es blanco');
      assert.equal(await explanation.evaluate(el => el.nextElementSibling.id), 'wallets-blixt', 'Después continúa Blixt');
      const text = await spark.innerText() + await explanation.innerText();
      assert.match(text, /Spark no es Lightning/);
      assert.match(text, /sin abrir.*canales/i);
      assert.match(text, /operadores/i);
      assert.match(text, /honest[oa]/i);
      assert.doesNotMatch(text, /Tether|WDK/i, 'Spark se explica como protocolo de uso general');
      const diagram = explanation.locator('figure');
      assert.equal(await diagram.count(), 1, 'Esquema de funcionamiento');
      assert(await diagram.isVisible());
      for (const label of ['Bitcoin on-chain', 'Dentro de Spark', 'Vos', 'Otra persona', 'Operadores de Spark', 'Salida a Bitcoin', 'Pago por Lightning']) {
        assert(await diagram.getByText(label, { exact: true }).isVisible(), `Parte visible del esquema: ${label}`);
      }
      assert.match(await diagram.innerText(), /fuera de la cadena/i);
      assert.match(await diagram.innerText(), /proveedor/i);
      const deposit = await diagram.locator('.claim').first().boundingBox();
      const transfer = await diagram.locator('.spark-layer').boundingBox();
      const exits = await diagram.locator('.spark-exits').boundingBox();
      assert(deposit.y + deposit.height <= transfer.y && transfer.y + transfer.height <= exits.y, 'Flujo de depósito, transferencia y salida ordenado visualmente');
      for (const label of await diagram.locator('strong, .claim p, .spark-arrow').all()) {
        assert(await label.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 15 && el.scrollWidth <= el.clientWidth), 'Texto del esquema más grande y sin recortes');
      }
      const diagramBox = await diagram.boundingBox();
      const innerBox = await explanation.locator('.chapter-inner').boundingBox();
      assert(diagramBox.width >= innerBox.width - 1, 'Diagrama a todo el ancho, no en media columna');
      for (const card of await explanation.locator('.claim').all()) assert(await card.isVisible());
      for (const section of [spark, explanation]) {
        const bounds = await section.boundingBox();
        for (const element of await section.locator('h3, .lead, .claim, .comparison-note').all()) {
          const box = await element.boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width, 'Contenido dentro de los márgenes');
          assert(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height, 'Contenido dentro de la slide');
        }
      }
      assert.equal(await explanation.locator('a[href="https://docs.spark.money/learn/trust-model"]').count(), 1, 'Fuente del modelo de confianza');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('las capturas de LaWallet aprovechan más espacio sin recortes ni desbordes', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      for (const id of ['wallets-lawallet', 'wallets-lawallet-map']) {
        await goToPage(page, '#' + id);
        const image = page.locator('#' + id + ' .app-shot img');
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(el => el.decode());
        const box = await image.boundingBox();
        if (width === 1366) assert(box.width >= (id.endsWith('-map') ? 580 : 380), 'Captura más grande en escritorio');
        else {
          const layout = await page.locator('#' + id + ' .app-layout').boundingBox();
          assert(box.width >= layout.width - 22, 'En móvil aprovecha el ancho disponible');
        }
        assert(box.x >= 0 && box.x + box.width <= width, 'Dentro de los márgenes');
        assert(await image.evaluate(el => Math.abs(el.getBoundingClientRect().width / el.getBoundingClientRect().height - el.naturalWidth / el.naturalHeight) < .02), 'Imagen completa sin deformación');
        await image.click();
        assert(await page.locator('dialog[open]').isVisible(), 'Conserva la ampliación');
        await page.keyboard.press('Escape');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('la comparación termina en las wallets sin notas al pie', async () => {
  await withPage(async page => {
    await goToPage(page, '#wallets-tabla');
    const table = page.locator('#wallets-tabla');
    assert.equal(await table.locator('.wallet-option').count(), 12);
    assert.equal(await table.locator('.comparison-note').filter({ visible: true }).count(), 0, 'Sin texto final debajo de la tabla');
  });
});

test('toda la tarjeta de comparación alterna el detalle sin duplicar el click del encabezado ni interferir con enlaces', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-tabla');
      for (const wallet of await page.locator('.wallet-option').all()) {
        const summary = wallet.locator('summary');
        await summary.click();
        assert(await wallet.evaluate(el => el.open), 'El encabezado abre una sola vez');
        await wallet.locator('.wallet-explanation p').first().click();
        assert.equal(await wallet.evaluate(el => el.open), false, 'El texto del detalle también cierra');
        await wallet.click({ position: { x: 2, y: 2 } });
        assert(await wallet.evaluate(el => el.open), 'El margen de la tarjeta también abre');
        await wallet.locator('.pros-cons p').first().click();
        assert.equal(await wallet.evaluate(el => el.open), false, 'El recuadro de ventajas también cierra');
        await summary.focus();
        await page.keyboard.press('Enter');
        assert(await wallet.evaluate(el => el.open), 'Conservar teclado nativo');
        await page.evaluate(() => {
          document.addEventListener('click', event => {
            const link = event.target.closest('.wallet-option a');
            if (link) {
              event.preventDefault();
              window.clickedWalletLink = link.href;
            }
          }, { capture: true, once: true });
        });
        const link = wallet.locator('.wallet-option-code');
        await link.click();
        assert.equal(await page.evaluate(() => window.clickedWalletLink), await link.evaluate(el => el.href), 'El enlace sigue recibiendo su click');
        assert(await wallet.evaluate(el => el.open), 'Click en enlace no alterna la tarjeta');
        await summary.click();
        assert.equal(await wallet.evaluate(el => el.open), false, 'El encabezado también cierra una sola vez');
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('los créditos cierran la charla con siete agradecimientos y sus enlaces en escritorio y móvil', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const credits = page.locator('#creditos');
      assert.equal(await credits.count(), 1, 'Existe el slide final de créditos');
      assert.equal(await page.locator('main > section').last().getAttribute('id'), 'creditos');
      assert.equal(await page.locator('.chapter-nav a').last().getAttribute('href'), '#creditos');
      await goToPage(page, '#creditos');
      assert(await credits.getByRole('heading', { name: 'Gracias.', exact: true }).isVisible());
      assert.equal(await credits.locator('.lead').innerText(), 'A todos los que hicieron este workshop posible');
      const items = credits.locator('li');
      assert.equal(await items.count(), 7);
      assert.deepEqual(await items.locator('strong').allTextContents(), ['Jaqui', 'Andy', 'Baba', 'La Crypta', 'Veintiuno.lat', 'A todos los que vinieron hoy', 'Simplemente, a Bitcoin.']);
      const audience = items.nth(5);
      assert.equal(await audience.locator('a').count(), 0, 'Agradecimiento a los asistentes, sin enlace');
      const audienceBox = await audience.boundingBox();
      const jaquiBox = await items.first().boundingBox();
      assert(Math.abs(audienceBox.width - jaquiBox.width) < 1, 'El público tiene el ancho de las demás tarjetas');
      assert.equal(await audience.evaluate(el => getComputedStyle(el).gridColumn), await items.first().evaluate(el => getComputedStyle(el).gridColumn), 'El público no ocupa toda la fila');
      if (width === 1366) assert((await items.last().boundingBox()).width > audienceBox.width * 1.8, 'Solo Bitcoin ocupa la fila completa');
      assert.deepEqual(await credits.locator('a').evaluateAll(elements => elements.map(el => el.href)), [
        'https://x.com/Jaqui21M',
        'https://www.instagram.com/stories/jaqui21m/',
        'https://x.com/andycreed0x',
        'https://www.instagram.com/elbababarr/',
        'https://lacrypta.ar/',
        'https://discord.lacrypta.ar/',
        'https://veintiuno.lat/',
      ]);
      for (const item of await items.all()) {
        assert(await item.isVisible());
        const image = item.locator('img');
        assert.equal(await image.count(), 1, 'Una miniatura por persona o entidad');
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(el => el.decode());
        assert(await image.isVisible());
        assert((await image.getAttribute('alt')).trim().length > 0);
        assert(await image.evaluate(el => el.naturalWidth > 0 && new URL(el.currentSrc).origin === location.origin), 'Miniatura local y válida');
        const box = await image.boundingBox();
        assert(box.width >= 64 && box.width <= 112 && Math.abs(box.width - box.height) < 1, 'Miniatura cuadrada y visible');
        const bounds = await item.boundingBox();
        assert(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width, 'Dentro de su tarjeta');
        assert.equal(await image.evaluate(el => getComputedStyle(el).objectFit), ['Jaqui', 'Andy', 'Baba'].includes(await item.locator('strong').textContent()) ? 'cover' : 'contain', 'Retratos recortados y logos completos');
      }
      for (const link of await credits.locator('a').all()) {
        assert(await link.isVisible());
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.match(await link.getAttribute('rel'), /noreferrer|noopener/);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('Sobre mí enlaza al sitio personal fierillo.world', async () => {
  await withPage(async page => {
    await goToPage(page, '#speaker');
    const link = page.locator('#speaker .speaker-link');
    assert(await link.isVisible());
    assert.equal(await link.evaluate(el => el.href), 'https://fierillo.world/');
    assert.match(await link.innerText(), /fierillo\.world/);
  });
});

test('los siete valores de La Crypta usan el mismo formato que los valores de Fierillo', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const styles = locator => locator.evaluate(el => {
        const style = getComputedStyle(el);
        return Object.fromEntries(['color', 'fontFamily', 'fontSize', 'letterSpacing', 'lineHeight', 'textTransform', 'marginBottom'].map(key => [key, style[key]]));
      });
      await goToPage(page, '#speaker');
      const personal = await styles(page.locator('#speaker .speaker-values-line'));
      await goToPage(page, '#lacrypta');
      const values = page.locator('#lacrypta .lc-copy > p').filter({ hasText: 'Honestidad' });
      assert(await values.isVisible());
      assert.equal((await values.textContent()).trim(), 'Honestidad · Libertad · Sinergia · Racionalidad · Humildad · Mérito · Innovación');
      assert.deepEqual(await styles(values), personal, 'Misma tipografía, color, espaciado y mayúsculas');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('los badges de código conservan su color aunque cambie el enlace a la fuente', async () => {
  await withPage(async page => {
    await page.addStyleTag({ content: 'a { transition: none !important; }' });
    const badges = page.locator('.wallet-option-code');
    assert(await badges.count() > 0);
    for (const badge of await badges.all()) {
      const label = (await badge.textContent()).trim();
      const before = await badge.evaluate(el => getComputedStyle(el).color);
      const [red, green] = before.match(/\d+/g).map(Number);
      assert(label === 'Código abierto' ? green > red : red > green, `${label}: color incorrecto`);
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

test('todas las páginas se navegan sin contenido oculto ni desbordes en escritorio y móvil', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const links = page.locator('.chapter-nav a');
      const destinations = await links.evaluateAll(elements => elements.map(el => el.hash));
      for (let index = 0; index < destinations.length; index++) {
        await goToPage(page, destinations[index]);
        await page.waitForFunction(hash => document.querySelector('.chapter-nav a[aria-current]')?.hash === hash, destinations[index]);
        const section = page.locator(destinations[index]);
        assert(await section.isVisible(), `${width}px: ${destinations[index]} visible`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: sin scroll horizontal`);
        const shots = width <= 620 && destinations[index] === '#wallets-wos' ? '.wos-step-shot' : '.app-shot';
        for (const content of await section.locator(`.lead, .app-lines, .app-copy, ${shots}, .abacus, .ln-panels, .wallet-comparison`).all()) {
          assert(await content.isVisible(), `${width}px: no ocultar contenido principal`);
          const box = await content.boundingBox();
          assert(box.x >= -1 && box.x + box.width <= width + 1, `${width}px: contenido dentro de los márgenes`);
        }
        for (const image of await section.locator('.app-shot img, .app-logo').all()) {
          await image.evaluate(el => el.decode());
          assert(await image.evaluate(el => el.naturalWidth > 0 && el.naturalHeight > 0), 'Las imágenes se cargan realmente');
        }
      }
      const route = page.locator('.cashu-route');
      await route.locator('summary').click();
      assert(await route.locator('code').isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: URL de mint sin desborde`);
      const abacus = page.locator('.abacus');
      const inner = await abacus.locator('..').boundingBox();
      const graphic = await abacus.boundingBox();
      assert(graphic.x >= inner.x && graphic.x + graphic.width <= inner.x + inner.width + 1, 'El ábaco respeta la sangría');
      const button = await page.locator('#ab-send').boundingBox();
      const caption = await page.locator('#ab-status').boundingBox();
      assert(button.y >= caption.y + caption.height + 8, 'El botón va debajo del texto con espacio');
      await page.locator(width <= 620 ? '#wallets-wos .wos-step-shot img' : '#wallets-wos .app-shot img').first().click();
      assert(await page.locator('#lightbox').evaluate(el => el.open));
      const image = await page.locator('.lightbox-img').boundingBox();
      assert(image.width > 0 && image.x >= 0 && image.x + image.width <= width + 1, 'Imagen ampliada dentro de la pantalla');
      await page.keyboard.press('Escape');
    }, { viewport: { width, height: 844 } });
  }
});

test('en móvil la presentación de cada wallet precede a sus capturas y al video de Cashu', async () => {
  for (const width of [620, 390, 320]) {
    await withPage(async page => {
      const layouts = page.locator('.page:not(#wallets-wos):not(#wallets-zeus) .app-layout:has(.app-copy):has(.app-shot)');
      assert(await layouts.count() > 0);
      for (const layout of await layouts.all()) {
        await layout.scrollIntoViewIfNeeded();
        const copy = await layout.locator('.app-copy').boundingBox();
        const shot = await layout.locator('.app-shot').boundingBox();
        assert(shot.y >= copy.y + copy.height, `${width}px: ${await layout.locator('..').getAttribute('id')} presenta la wallet antes de la imagen`);
      }
      const zeus = page.locator('#wallets-zeus');
      await zeus.locator('.cashu-route summary').click();
      await zeus.locator('video').waitFor({ state: 'visible' });
      const copy = await zeus.locator('.cashu-route ol').boundingBox();
      const video = await zeus.locator('.app-shot').boundingBox();
      assert(video.y >= copy.y + copy.height, 'El video queda después de los pasos de Cashu');
    }, { viewport: { width, height: 844 } });
  }
});

test('en móvil las capturas de wallets son grandes, centradas y respetan los márgenes', async () => {
  for (const width of [620, 390, 320]) {
    await withPage(async page => {
      for (const layout of await page.locator('.page:not(#wallets-wos):not(#wallets-zeus) .app-layout:has(.app-shot)').all()) {
        await layout.scrollIntoViewIfNeeded();
        const inner = await layout.boundingBox();
        const figure = await layout.locator('.app-shot').boundingBox();
        const image = layout.locator('.app-shot img');
        await image.evaluate(el => el.decode());
        const box = await image.boundingBox();
        assert(Math.abs((figure.x + figure.width / 2) - (inner.x + inner.width / 2)) < 1, `${width}px: captura centrada`);
        assert(box.width >= Math.min(inner.width - 12, 220), `${width}px: captura mayor que la miniatura anterior`);
        assert(figure.x >= inner.x - 1 && figure.x + figure.width <= inner.x + inner.width + 1, 'Respeta los márgenes');
      }
      const zeus = page.locator('#wallets-zeus');
      await zeus.locator('.cashu-route summary').click();
      await zeus.locator('video').waitFor({ state: 'visible' });
      const inner = await zeus.locator('.cashu-route').boundingBox();
      const figure = await zeus.locator('.app-shot').boundingBox();
      assert(Math.abs((figure.x + figure.width / 2) - (inner.x + inner.width / 2)) < 1, 'El video también queda centrado');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('la intro del taller conserva 06 Manos a la obra en naranja, el título y continúa con WoS', async () => {
  await withPage(async page => {
    await page.locator('.chapter-nav a[href="#workshop-inicio"]').click();
    const intro = page.locator('#workshop-inicio');
    const heading = intro.getByRole('heading', { name: 'De la teoría a tu primera wallet.' });
    assert(await heading.isVisible());
    const index = intro.locator('.chapter-index');
    assert.equal(await index.count(), 1, 'Conservar la numeración de la sección 06');
    assert(await index.isVisible());
    assert.match(await index.innerText(), /^06\s+Manos a la obra$/);
    for (const element of [index, index.locator('span')]) {
      const [red, green, blue] = await element.evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
      assert(red > green && green > blue, 'Número y nombre en naranja');
    }
    assert.equal((await intro.innerText()).replace(await index.innerText(), '').replace(await heading.innerText(), '').trim(), '', 'Sin texto, advertencias ni pasos adicionales');
    assert.equal(await intro.evaluate(el => el.nextElementSibling.id), 'wallets-wos');
    const link = page.locator('.chapter-nav a[href="#workshop-inicio"]');
    assert.equal(await link.evaluate(el => el.nextElementSibling.hash), '#wallets-wos');
    await page.locator('.chapter-nav a[href="#wallets-wos"]').click();
    await page.waitForFunction(() => document.querySelector('.chapter-nav a[aria-current]')?.hash === '#wallets-wos');
    assert(await page.locator('#wallets-wos .wos-steps').isVisible());
  });
});

test('la barra de puntitos desaparece en móvil pero sigue en escritorio y se puede navegar desplazándose', async () => {
  for (const width of [1366, 620, 390, 320]) {
    await withPage(async page => {
      const navigation = page.getByRole('navigation', { name: 'Ir a una página', includeHidden: true });
      if (width > 620) assert(await navigation.isVisible(), 'Conservar navegación de escritorio');
      else {
        assert(await navigation.isHidden(), 'Sin barra de puntitos en móvil');
        assert.equal(await page.getByRole('navigation', { name: 'Ir a una página' }).count(), 0, 'No ofrecer enlaces ocultos a tecnologías asistivas');
        await goToPage(page, '#wallets-wos');
        assert(await page.locator('#wallets-wos .wos-steps').isVisible());
        await goToPage(page, '#wallets-blixt');
        assert(await page.locator('#wallets-blixt .app-shot').isVisible());
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('el encabezado conserva el título compacto con fondo negro degradado y sin botón de taller', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      assert.equal(await page.getByRole('banner').count(), 0, 'Sin encabezado superior');
      assert.equal(await page.getByRole('link', { name: /Ir al taller/ }).count(), 0, 'Sin botón de taller');
      for (const [hash, title] of [['#wallets-strike', /Wallets/], ['#wallets-wos', /06\s+Manos a la obra/]]) {
        await goToPage(page, hash);
        const sticky = page.locator('#section-sticky');
        await sticky.waitFor({ state: 'visible' });
        assert.match(await sticky.innerText(), title, 'Se conserva el título del capítulo activo');
        const style = await sticky.evaluate(el => {
          const css = getComputedStyle(el);
          return { background: css.backgroundImage, color: css.backgroundColor, top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height };
        });
        assert.match(style.background, /linear-gradient\(.*rgba?\(0, 0, 0[,)]/, 'Fondo negro degradado');
        assert.match(style.background, /rgba\(0, 0, 0, 0\)/, 'El fondo se desvanece a transparente');
        assert.equal(style.color, 'rgba(0, 0, 0, 0)');
        assert(style.top <= 1 && style.height < 48, 'Título compacto en la parte superior');
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('la sección de wallets abre con conceptos, claves y Lightning Address antes de presentar wallets', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const pages = page.locator('#wallets > .page');
      const expected = ['wallets-conceptos', 'wallets-llaves', 'wallets-address', 'wallets-strike'];
      assert.deepEqual((await pages.evaluateAll(elements => elements.map(el => el.id))).slice(0, expected.length), expected, 'Orden introductorio de la sección 5');
      for (const [id, title] of [['wallets-conceptos', 'Fijemos algunos conceptos'], ['wallets-address', '¿Tiene Lightning Address?']]) {
        await goToPage(page, '#' + id);
        const section = page.locator('#' + id);
        assert(await section.getByRole('heading', { name: title, exact: true }).isVisible());
        if (id === 'wallets-conceptos') assert.equal((await section.innerText()).trim(), title, 'La portada conserva solo el título');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await goToPage(page, '#wallets-llaves');
      assert(await page.locator('#wallets-llaves').getByRole('heading', { name: '¿Quién tiene las claves?', exact: true }).isVisible());
      assert.equal(await page.locator('#wallets-llaves .keys-cards .claim').count(), 2, 'Conservar la explicación de custodia');
    }, { viewport: { width, height: 844 } });
  }
});

test('Lightning Address explica cómo recibir y presenta tres badges sin aclaraciones al pie', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-address');
      const section = page.locator('#wallets-address');
      const cards = section.locator('.keys-cards .claim');
      assert.equal(await cards.count(), 3, 'Tres variantes en la misma estructura de tarjetas que custodia');
      const badges = cards.locator('.claim-tag');
      assert.deepEqual(await badges.allTextContents(), ['LN Address personalizada', 'LN Address asignada', 'Sin LN Address']);
      const colors = [];
      for (const badge of await badges.all()) {
        assert(await badge.isVisible());
        colors.push(await badge.evaluate(el => getComputedStyle(el).color));
      }
      assert.equal(new Set(colors).size, 3, 'Estados distinguibles también visualmente');
      assert.deepEqual(colors, ['rgb(134, 217, 147)', 'rgb(231, 194, 111)', 'rgb(166, 170, 161)'], 'Personalizada verde, asignada amarilla y sin dirección gris');
      const explanation = await section.innerText();
      assert.match(explanation, /[\w.-]+@[\w.-]+\.example/);
      assert.match(explanation, /recibir.*sats/is);
      assert.match(explanation, /no es.*correo/is);
      assert.match(await cards.nth(2).innerText(), /factura.*Lightning/is, 'Sin dirección igual puede recibir por factura');
      assert.match(await cards.nth(0).innerText(), /elegís.*nombre/is);
      assert.match(await cards.nth(1).innerText(), /servicio.*(genera|asigna)/is);
      assert.match(await cards.nth(1).innerText(), /requisitos.*suscripción/is, 'Asignada no promete personalización gratuita ni necesariamente paga');
      assert.equal(await section.locator('.keys-cards + p').count(), 0, 'Sin frase ni aclaraciones después de los badges');
      for (const card of await cards.all()) {
        const box = await card.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }, { viewport: { width, height: 844 } });
  }
});

test('las wallets principales muestran badges de LN Address con los colores de la leyenda y sus condiciones', async () => {
  const expected = {
    strike: ['LN Address personalizada'],
    tether: ['LN Address personalizada'],
    blixt: ['LN Address personalizada'],
    wos: ['LN Address asignada'],
    zeus: ['LN Address asignada'],
    lawallet: ['LN Address personalizada'],
  };
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const legend = await page.locator('#wallets-address .claim-tag').evaluateAll(elements =>
        Object.fromEntries(elements.map(el => [el.textContent, getComputedStyle(el).color])));
      for (const [wallet, labels] of Object.entries(expected)) {
        await goToPage(page, '#wallets-' + wallet);
        const copy = page.locator('#wallets-' + wallet + ' .app-copy');
        const badges = copy.locator(':scope > .claim-tag').filter({ hasText: 'LN Address' });
        assert.deepEqual(await badges.allTextContents(), labels, `${wallet}: opciones para recibir`);
        for (const badge of await badges.all()) {
          assert(await badge.isVisible());
          const text = await badge.textContent();
          assert.equal(await badge.evaluate(el => getComputedStyle(el).color), legend[text]);
          const box = await badge.boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width + 1, `${wallet}: badge dentro de los márgenes`);
          assert(box.y < (await copy.locator('.app-lines, .pros-cons').first().boundingBox()).y, 'Badge junto a custodia y código, antes de la explicación');
        }
        if (wallet === 'zeus') assert.match(await copy.innerText(), /Cashu.*Pay\+/is, 'Distingue opción gratis y personalización paga');
        if (wallet === 'wos') assert.match(await badges.first().getAttribute('title'), /aleatoria.*requisitos/is);
        if (wallet === 'blixt') assert.match(await copy.innerText(), /Lightning Box.*Android.*persistente/is);
        if (wallet === 'lawallet') {
          assert.match(await copy.innerText(), /LaWallet.*dirección.*sin cargo.*cortesía/is, 'La dirección la ofrece LaWallet en la instancia del taller');
          assert.match(await copy.innerText(), /wallet conectada.*(costos|comisiones)/is, 'Los costos de la wallet conectada no convierten la dirección en externa');
          assert.match(await badges.first().getAttribute('title'), /cortesía/is, 'El badge no promete gratuidad para cualquier despliegue');
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('WoS en móvil muestra cada paso seguido de sus capturas al bajar y conserva la galería de escritorio', async () => {
  for (const width of [620, 390, 320, 1366]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-wos');
      const tutorial = page.locator('#wallets-wos');
      const steps = tutorial.locator('.wos-steps > li');
      assert.equal(await steps.count(), 4);
      if (width > 620) {
        assert(await tutorial.locator('.app-shot').isVisible());
        assert.equal(await tutorial.locator('.wos-step-shot:visible').count(), 0, 'Sin duplicados en escritorio');
        return;
      }
      assert.equal(await tutorial.locator('.wos-step-shot img').count(), 5, 'Cuatro pasos y dos capturas de respaldo');
      assert(await tutorial.locator('.app-shot').isHidden(), 'Sin una galería aislada al final');
      for (let index = 0; index < await steps.count(); index++) {
        const step = steps.nth(index);
        const button = step.locator('button');
        const images = step.locator('.wos-step-shot img');
        assert.equal(await images.count(), index === 3 ? 2 : 1);
        for (const image of await images.all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(el => el.decode());
          assert(await image.isVisible());
          const label = await button.boundingBox();
          const box = await image.boundingBox();
          const bounds = await step.boundingBox();
          assert(box.y >= label.y + label.height, 'La captura sigue a las instrucciones de su paso');
          assert(box.y + box.height <= bounds.y + bounds.height + 1, 'No se mezcla con el siguiente paso');
          assert(Math.abs((box.x + box.width / 2) - (bounds.x + bounds.width / 2)) < 1, 'Captura centrada');
          assert(box.width >= Math.min(bounds.width, 240) - 12, 'Captura legible dentro de los márgenes');
          assert.equal(await image.evaluate(el => getComputedStyle(el).objectFit), 'contain');
          await image.focus();
          await page.keyboard.press('Enter');
          assert(await page.locator('#lightbox').evaluate(el => el.open));
          assert.equal(await page.locator('.lightbox-img').getAttribute('src'), await image.evaluate(el => el.currentSrc));
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('#lightbox').open);
          assert(await image.evaluate(el => document.activeElement === el));
        }
        if (index < await steps.count() - 1) {
          assert((await steps.nth(index + 1).boundingBox()).y >= (await step.boundingBox()).y + (await step.boundingBox()).height - 1, 'Los pasos avanzan al bajar');
        }
      }
    }, { viewport: { width, height: 844 } });
  }
});

test('ZEUS en móvil coloca cada medio junto a su ruta y restaura la columna de escritorio', async () => {
  for (const width of [620, 390, 320]) {
    await withPage(async page => {
      await goToPage(page, '#wallets-zeus');
      const zeus = page.locator('#wallets-zeus');
      const route = zeus.locator('.cashu-route');
      const figure = zeus.locator('.app-shot');
      const channels = zeus.locator('.app-lines > li').nth(1);
      assert.equal(await channels.locator('.app-shot').count(), 1, 'La captura acompaña Canales propios');
      assert(await figure.locator('img').isVisible());
      const screenshot = await figure.boundingBox();
      const next = await zeus.locator('.app-copy > .comparison-note').last().boundingBox();
      assert(screenshot.y + screenshot.height <= next.y, 'La captura aparece antes del cierre de la explicación');
      await route.locator('summary').click();
      await figure.locator('video').waitFor({ state: 'visible' });
      assert.equal(await route.locator('.app-shot').count(), 1, 'El video acompaña la configuración de Cashu');
      const steps = await route.locator('ol').boundingBox();
      const video = await figure.boundingBox();
      const notes = await route.locator('.comparison-note').first().boundingBox();
      assert(video.y >= steps.y + steps.height && video.y + video.height <= notes.y, 'Video entre los pasos y las notas, no al final de la wallet');
      assert.equal(await zeus.locator('video').count(), 1, 'Mover el original, no duplicar el video');
      await page.setViewportSize({ width: 1366, height: 844 });
      await page.waitForFunction(() => document.querySelector('#wallets-zeus .app-shot').parentElement.classList.contains('app-layout'));
      await route.locator('summary').click();
      await figure.locator('img').waitFor({ state: 'visible' });
      assert(await figure.locator('video').evaluate(el => el.paused));
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() => document.querySelector('#wallets-zeus .app-shot').parentElement.tagName === 'LI');
      assert.equal(await channels.locator('.app-shot').count(), 1);
    }, { viewport: { width, height: 844 } });
  }
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

test('Blixt sigue a Tether y el taller empieza antes de WoS, ZEUS y LaWallet sin perder sus presentaciones', async () => {
  await withPage(async page => {
    const order = ['wallets-strike', 'wallets-tether', 'wallets-blixt', 'workshop-inicio', 'wallets-wos', 'wallets-zeus', 'wallets-lawallet'];
    assert.deepEqual(await page.locator('main .page').evaluateAll((elements, ids) => elements.map(el => el.id).filter(id => ids.includes(id)), order), order, 'Blixt cierra la presentación y luego empieza el taller');
    assert.deepEqual(await page.locator('.chapter-nav a').evaluateAll((elements, ids) => elements.map(el => el.hash.slice(1)).filter(id => ids.includes(id)), order), order, 'La navegación sigue el mismo orden');
    for (const id of ['wallets-wos', 'wallets-zeus', 'wallets-lawallet']) {
      assert.equal(await page.locator('#' + id).evaluate(el => el.closest('section').id), 'workshop', 'Los tutoriales pertenecen al taller');
    }
    await page.locator('.chapter-nav a[href="#wallets-blixt"]').click();
    const blixt = page.locator('#wallets-blixt');
    assert(await blixt.getByRole('heading', { name: 'Blixt Wallet', exact: true }).isVisible());
    assert(await blixt.locator('.claim-tag.is-self').isVisible());
    assert(await blixt.locator('.claim-tag.is-open').isVisible());
    assert.equal(await blixt.locator('.pros-cons > div').count(), 2);
    await page.locator('.chapter-nav a[href="#workshop-inicio"]').click();
    assert(await page.locator('#workshop-inicio').getByRole('heading', { name: 'De la teoría a tu primera wallet.' }).isVisible());
    const section = page.locator('#wallets-tether');
    assert.equal(await section.count(), 1, 'Tether Wallet debe tener su propia página');
    assert.equal(await section.evaluate(el => el.previousElementSibling.id), 'wallets-strike');
    await page.locator('.chapter-nav').getByRole('link', { name: 'Tether Wallet', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.chapter-nav a[aria-current]')?.hash === '#wallets-tether');
    assert(await section.getByRole('heading', { name: 'Tether Wallet', exact: true }).count() === 1);
    assert(await section.locator('.claim-tag.is-self').isVisible());
    assert(await section.locator('.claim-tag.is-closed').isVisible());
    assert.equal(await section.locator('.pros-cons > div').count(), 2);
    const image = section.locator('.app-shot img');
    await image.evaluate(el => el.decode());
    assert(await image.isVisible());
    await image.click();
    assert(await page.locator('#lightbox').evaluate(el => el.open));
    assert.equal(await page.locator('.lightbox-img').getAttribute('src'), await image.evaluate(el => el.currentSrc));
    await page.keyboard.press('Escape');
  });
});

test('Blixt releva sus capturas en una imagen grande y amplía la actual en escritorio y móvil', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const section = page.locator('#wallets-blixt');
      await goToPage(page, '#wallets-blixt');
      const image = section.locator('.app-shot img');
      assert.equal(await image.count(), 1, 'Una sola captura grande por vez');
      const sources = new Set();
      for (let index = 0; index < 2; index++) {
        await image.evaluate(el => el.decode());
        sources.add(await image.evaluate(el => el.currentSrc));
        assert(await image.isVisible());
        assert(await image.evaluate(el => el.naturalHeight > el.naturalWidth), 'Capturas verticales de la app');
        const box = await image.boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1, 'Dentro de los márgenes');
        const available = await section.locator('.chapter-inner').boundingBox();
        assert(box.width > Math.min(available.width, 360) * .6, 'Más grande que las dos miniaturas en paralelo');
        assert.match(await section.locator('.app-image-nav').innerText(), new RegExp(`${index + 1}\\s*/\\s*2`));
        assert.equal(await image.evaluate(el => getComputedStyle(el).objectFit), 'contain', 'Sin recortar la UI');
        await image.focus();
        await page.keyboard.press('Enter');
        assert(await page.locator('#lightbox').evaluate(el => el.open));
        assert.equal(await page.locator('.lightbox-img').getAttribute('src'), await image.evaluate(el => el.currentSrc));
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#lightbox').open);
        if (index === 0) await section.getByRole('button', { name: 'Captura siguiente', exact: true }).click();
      }
      assert.equal(sources.size, 2, 'Se conservan ambas capturas de la UI');
      const next = await image.evaluate(el => el.currentSrc);
      await section.getByRole('button', { name: 'Captura anterior', exact: true }).focus();
      await page.keyboard.press('Enter');
      await image.evaluate(el => el.decode());
      assert.notEqual(await image.evaluate(el => el.currentSrc), next);
      assert.match(await section.locator('.app-image-nav').innerText(), /1\s*\/\s*2/);
    }, { viewport: { width, height: 844 } });
  }
});

test('el mapa mundial de Lightning precede a las wallets y se amplía sin recorte en móvil y escritorio', async () => {
  for (const width of [1366, 390, 320]) {
    await withPage(async page => {
      const section = page.locator('#lightning-mapa');
      assert.equal(await section.count(), 1, 'El mapa tiene una página propia');
      assert(await section.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('#wallets')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Antes de hablar de wallets');
      await goToPage(page, '#lightning-mapa');
      await page.waitForFunction(() => document.querySelector('.chapter-nav a[aria-current]')?.hash === '#lightning-mapa');
      assert(await section.getByRole('heading', { name: /Señoras y señores.*red Lightning de Bitcoin/i }).isVisible());
      const image = section.locator('img');
      await image.evaluate(el => el.decode());
      assert(await image.isVisible());
      const frame = await image.boundingBox();
      const content = await section.locator('.chapter-inner').boundingBox();
      assert(frame.x >= content.x - 1 && frame.x + frame.width <= content.x + content.width + 1, 'Respeta la sangría');
      assert.equal(await image.evaluate(el => getComputedStyle(el).objectFit), 'contain', 'Mapa completo, sin recortar');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await image.focus();
      await page.keyboard.press('Enter');
      const dialog = page.locator('#lightbox');
      assert(await dialog.evaluate(el => el.open));
      assert.equal(await dialog.locator('.lightbox-img').getAttribute('src'), await image.evaluate(el => el.currentSrc));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#lightbox').open);
      assert(await image.evaluate(el => document.activeElement === el));
    }, { viewport: { width, height: 844 } });
  }
});
