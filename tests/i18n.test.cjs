// Contratos de i18n sobre la página real cargada en jsdom (sin navegador).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadPage: load, STORAGE_KEY } = require('./support/page.cjs');

// Cierra cada ventana aunque el test falle, para no dejar timers vivos.
async function loadPage(t, options) {
  const page = await load(options);
  t.after(page.close);
  return page;
}

const TRANSLATABLE_ATTRS = ['aria-label', 'alt', 'title', 'content', 'data-caption', 'data-alt', 'data-caption-next', 'data-alt-next'];

// Nombres propios y préstamos que el inglés usa igual.
const PROPER_NAMES = /La Crypta|Veintiuno(\.lat)?|Belgrano|café/g;
const SPANISH = /[ñ¿¡áéíóú]|\b(el|la|los|las|del|que|con|para|por|una|tu|tus|sus|sin|más|pero|como|esta|este|hay|vos|según|cuando|desde|y|de|en|es|se|al|lo|su|mi)\b/i;

function attrSpec(el) {
  return el.dataset.i18nAttr.split(';').filter(Boolean).map((pair) => pair.split(':').map((s) => s.trim()));
}

function keysUsedInHtml(document) {
  const keys = new Set();
  document.querySelectorAll('[data-i18n]').forEach((el) => keys.add(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach((el) => keys.add(el.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => attrSpec(el).forEach(([, key]) => keys.add(key)));
  return keys;
}

function scriptSource(document) {
  return [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n');
}

function spanishResidue(document) {
  const hits = [];
  const check = (where, raw) => {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (text && SPANISH.test(text.replace(PROPER_NAMES, ''))) hits.push(`${where}: ${text}`);
  };
  check('title', document.title);
  const walker = document.createTreeWalker(document.body, document.defaultView.NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    const parent = node.parentElement;
    if (parent.closest('script, style, [translate="no"]')) continue;
    check(`<${parent.tagName.toLowerCase()}>`, node.nodeValue);
  }
  for (const attr of TRANSLATABLE_ATTRS) {
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      if (el.closest('[translate="no"]') || (attr === 'content' && el.tagName !== 'META')) return;
      check(`${el.tagName.toLowerCase()}[${attr}]`, el.getAttribute(attr));
    });
  }
  return hits;
}

test('todo script inline parsea y la página carga y cambia de idioma sin errores', async (ctx) => {
  const page = await loadPage(ctx);
  const vm = require('node:vm');
  for (const [i, script] of [...page.document.querySelectorAll('script')].entries()) {
    assert.doesNotThrow(() => new vm.Script(script.textContent), `script #${i}`);
  }
  page.window.WorkshopilloI18n.setLang('en');
  page.window.WorkshopilloI18n.setLang('es');
  assert.deepEqual(page.errors.map((e) => e.message), []);
});

test('toda clave usada existe en es y en; no hay claves huérfanas', async (ctx) => {
  const page = await loadPage(ctx);
  const { t, keys } = page.window.WorkshopilloI18n;
  const source = scriptSource(page.document);
  const used = keysUsedInHtml(page.document);
  for (const match of source.matchAll(/\bt\("([\w.-]+)"/g)) used.add(match[1]);
  // Copias locales: los arrays de jsdom vienen de otro realm.
  const es = [...keys().es];
  const en = [...keys().en];
  assert.deepEqual([...used].filter((k) => !es.includes(k)), [], 'faltan en es');
  assert.deepEqual([...used].filter((k) => !en.includes(k)), [], 'faltan en en');
  assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'es sin en');
  const referenced = (k) => used.has(k) || source.includes(`"${k}"`);
  assert.deepEqual(en.filter((k) => !referenced(k)), [], 'claves huérfanas');
  for (const key of used) {
    assert.ok(t(key, 'es') && t(key, 'es') !== key, `es vacía: ${key}`);
    assert.ok(t(key, 'en') && t(key, 'en') !== key, `en vacía: ${key}`);
  }
  const textless = page.document.querySelectorAll('meta[data-i18n], meta[data-i18n-html], img[data-i18n], img[data-i18n-html], input[data-i18n]');
  assert.equal(textless.length, 0, 'un elemento sin contenido se traduce con data-i18n-attr');
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(t(key), key, `${key} no es una clave`);
  }
});

test('el diccionario no queda expuesto ni mutable en window', async (ctx) => {
  const page = await loadPage(ctx);
  const api = page.window.WorkshopilloI18n;
  for (const name of ['messages', 'phrases', 'htmlPhrases']) assert.equal(api[name], undefined, name);
  api.keys().en.push('x');
  assert.ok(!api.keys().en.includes('x'));
});

test('EN: sin español visible ni en atributos, también tras interactuar', async (ctx) => {
  const page = await loadPage(ctx, { storedLang: 'en' });
  const { document } = page;
  assert.deepEqual(spanishResidue(document), []);
  document.querySelector('#wallets-blixt .app-image-nav button').click();
  document.querySelectorAll('#wallets-wos .wos-steps button')[1].click();
  document.querySelector('.lb-trigger').click();
  assert.deepEqual(spanishResidue(document), [], 'tras galería, WoS y lightbox');
});

test('roundtrip ES→EN→ES idéntico, sin originales guardados en el DOM', async (ctx) => {
  const page = await loadPage(ctx);
  const { document } = page;
  const es = document.documentElement.outerHTML;
  assert.doesNotMatch(es, /data-i18n-src/);
  page.window.WorkshopilloI18n.setLang('en');
  const en = document.documentElement.outerHTML;
  assert.notEqual(en, es);
  page.window.WorkshopilloI18n.setLang('es');
  assert.equal(document.documentElement.outerHTML, es);

  const fromStorage = await loadPage(ctx, { storedLang: 'en' });
  assert.equal(fromStorage.document.documentElement.outerHTML, en, 'cargar en EN = cambiar a EN');
});

test('el idioma persiste en localStorage y se rechaza un valor inválido', async (ctx) => {
  const page = await loadPage(ctx);
  const { window, document } = page;
  document.querySelector('.lang-switch button[data-lang="en"]').click();
  assert.equal(window.localStorage.getItem(STORAGE_KEY), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.querySelector('.lang-switch button[data-lang="en"]').getAttribute('aria-pressed'), 'true');
  window.WorkshopilloI18n.setLang('fr');
  assert.equal(window.WorkshopilloI18n.lang, 'en');
  assert.equal(window.localStorage.getItem(STORAGE_KEY), 'en');

  const invalid = await loadPage(ctx, { storedLang: 'fr' });
  assert.equal(invalid.window.WorkshopilloI18n.lang, 'es');
  assert.equal(invalid.document.documentElement.lang, 'es');
});
