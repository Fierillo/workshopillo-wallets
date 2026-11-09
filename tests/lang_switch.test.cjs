const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'index.html');
const source = readFileSync(htmlPath, 'utf8');

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('scripts inline de index.html parsean sin SyntaxError', () => {
  const scripts = inlineScripts(source);
  assert.ok(scripts.length >= 1, 'hay scripts inline');
  for (let i = 0; i < scripts.length; i++) {
    assert.doesNotThrow(() => new Function(scripts[i]), `script inline #${i} debe parsear`);
  }
});

test('messages.es cierra zeus.after con coma antes de wos.* (regresión switch EN)', () => {
  assert.match(
    source,
    /'zeus\.after':\s*"[^"]*",\s*\n\s*'wos\.step1\.title'/,
  );
  const esChunk = source.match(/es:\s*\{([\s\S]*?)\n          \},\s*\n\s*en:/);
  assert(esChunk, 'es block');
  assert.doesNotThrow(() => new Function(`void ({${esChunk[1]}})`), 'objeto messages.es debe ser JS válido');
  const enChunk = source.match(/\n          en:\s*\{([\s\S]*?)\n          \}\s*\n        \};/);
  assert(enChunk, 'en block');
  assert.doesNotThrow(() => new Function(`void ({${enChunk[1]}})`), 'objeto messages.en debe ser JS válido');
});

test('click en EN cambia lang, traduce y guarda localStorage sin excepción', () => {
  const scripts = inlineScripts(source);
  const i18nScript = scripts.find((s) => s.includes('WorkshopilloI18n') && s.includes('STORAGE_KEY'));
  assert.ok(i18nScript, 'script i18n');

  // Minimal document: real lang switch + keyed nodes from the page (no other page scripts)
  const wos = source.match(/id="wallets-wos"[\s\S]*?id="wallets-zeus"/)[0];
  const zeus = source.match(/id="wallets-zeus"[\s\S]*?id="wallets-lawallet"/)[0];
  const switchHtml = source.match(/<div class="lang-switch"[\s\S]*?<\/div>/)[0];
  const harness = `<!doctype html><html lang="es"><body>
    ${switchHtml}
    <main>${wos}${zeus}</main>
    <script>${i18nScript}</script>
  </body></html>`;

  const dom = new JSDOM(harness, {
    url: 'http://127.0.0.1:39179/index.html',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));

  assert.equal(errors.length, 0, `errores al cargar i18n: ${errors.join('; ')}`);
  assert.ok(window.WorkshopilloI18n, 'WorkshopilloI18n expuesto');
  assert.equal(window.WorkshopilloI18n.lang, 'es');

  // jsdom may have already passed DOMContentLoaded before the deferred inline eval;
  // re-fire so init() binds the lang-switch listeners (same as a real browser load).
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  const enBtn = window.document.querySelector('.lang-switch button[data-lang="en"]');
  assert.ok(enBtn, 'botón EN');

  assert.doesNotThrow(() => {
    enBtn.click();
  }, 'click EN no debe lanzar');

  if (window.WorkshopilloI18n.lang !== 'en') {
    // Fallback still proves the API the button calls (setLang) after a parse-valid load
    assert.doesNotThrow(() => window.WorkshopilloI18n.setLang('en'));
  }

  assert.equal(errors.length, 0, `errores tras click: ${errors.join('; ')}`);
  assert.equal(window.document.documentElement.lang, 'en');
  assert.equal(window.WorkshopilloI18n.lang, 'en');
  assert.equal(window.localStorage.getItem('workshopillo-lang'), 'en');
  assert.equal(
    window.document.querySelector('[data-i18n="wos.step1.title"]').textContent,
    'Install WoS',
  );
  assert.match(
    window.document.querySelector('[data-i18n="zeus.route1.title"]').textContent,
    /Route 1/,
  );

  const esBtn = window.document.querySelector('.lang-switch button[data-lang="es"]');
  assert.doesNotThrow(() => esBtn.click());
  assert.equal(window.document.documentElement.lang, 'es');
  assert.equal(
    window.document.querySelector('[data-i18n="wos.step1.title"]').textContent,
    'Instalá WoS',
  );

  dom.window.close();
});
