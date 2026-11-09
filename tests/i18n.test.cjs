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

const TRANSLATABLE_ATTRS = ['aria-label', 'alt', 'title', 'content'];

// Nombres propios y préstamos que el inglés usa igual.
const PROPER_NAMES = /La Crypta|Veintiuno(\.lat)?|Belgrano|café/g;
const SPANISH = /[ñ¿¡áéíóú]|\b(el|la|los|las|del|que|con|para|por|una|tu|tus|sus|sin|más|pero|como|esta|este|hay|vos|según|cuando|desde|y|de|en|es|se|al|lo|su|mi)\b/i;

function attrSpec(el) {
  return el.dataset.i18nAttr.split(';').filter(Boolean).map((pair) => {
    const colon = pair.indexOf(':');
    return [pair.slice(0, colon), pair.slice(colon + 1)];
  });
}

// Una especificación es "clave", "clave+clave" o lleva literales "=texto" sin traducir.
function addSpec(keys, spec) {
  spec.split('+').filter((part) => !part.startsWith('=')).forEach((key) => keys.add(key));
}

function keysUsedInDom(document, keys = new Set()) {
  document.querySelectorAll('[data-i18n]').forEach((el) => addSpec(keys, el.dataset.i18n));
  document.querySelectorAll('[data-i18n-html]').forEach((el) => addSpec(keys, el.dataset.i18nHtml));
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => attrSpec(el).forEach(([, spec]) => addSpec(keys, spec)));
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
  // Las claves que el JS pone al interactuar también quedan en el DOM.
  const used = keysUsedInDom(page.document);
  await exerciseGeneratedText(page);
  keysUsedInDom(page.document, used);
  // Copias locales: los arrays de jsdom vienen de otro realm.
  const es = [...keys().es];
  const en = [...keys().en];
  assert.deepEqual([...used].filter((k) => !es.includes(k)), [], 'faltan en es');
  assert.deepEqual([...used].filter((k) => !en.includes(k)), [], 'faltan en en');
  assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'es sin en');
  const escape = (k) => k.replace(/[.]/g, '\\.');
  const referenced = (k) => used.has(k) || new RegExp(`(^|[^\\w.-])${escape(k)}([^\\w.-]|$)`).test(source);
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

// Ejercita todo lo que el JS genera o cambia: galería de Blixt, ábaco, pasos de WoS y ampliación.
async function exerciseGeneratedText(page) {
  const { document, window } = page;
  document.querySelector('#wallets-blixt .app-image-nav button').click();
  document.getElementById('ab-send').click();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const steps = document.querySelectorAll('#wallets-wos .wos-steps button');
  steps[steps.length - 1].click();
  document.querySelector('#wallets-wos .wos-image-nav button').click();
  document.querySelector('#wallets-blixt .app-shot img').click();
  document.querySelector('#lightbox .lightbox-close').click();
}

test('el texto que genera el JS sigue al idioma: ES→EN→ES sin restos', async (ctx) => {
  const page = await loadPage(ctx, { reducedMotion: true });
  const { document, window } = page;
  await exerciseGeneratedText(page);
  assert.equal(document.getElementById('ab-send').textContent.trim(), 'Repetir pago de ejemplo', 'el ábaco terminó');
  assert.match(document.getElementById('lightbox').getAttribute('aria-label'), /^Vista ampliada: /);
  const es = document.documentElement.outerHTML;
  window.WorkshopilloI18n.setLang('en');
  assert.deepEqual(spanishResidue(document), []);
  assert.equal(document.getElementById('ab-send').textContent.trim(), 'Repeat sample payment');
  assert.match(document.getElementById('lightbox').getAttribute('aria-label'), /^Enlarged view: /);
  window.WorkshopilloI18n.setLang('es');
  assert.equal(document.documentElement.outerHTML, es);
});

test('ningún bloque escucha el cambio de idioma solo para reponer texto', async (ctx) => {
  const types = [];
  const page = await loadPage(ctx, {
    onWindow(window) {
      const add = window.EventTarget.prototype.addEventListener;
      window.EventTarget.prototype.addEventListener = function (type, ...rest) {
        types.push(type);
        return add.call(this, type, ...rest);
      };
    },
  });
  await exerciseGeneratedText(page);
  assert.deepEqual(types.filter((type) => type === 'workshopillo:langchange'), []);
});


test('la galería de WoS copia la captura del paso activo sin tocar las de cada paso', async (ctx) => {
  const page = await loadPage(ctx);
  const { document } = page;
  const tutorial = document.getElementById('wallets-wos');
  const stepCaptions = () => [...tutorial.querySelectorAll('.wos-step-shot figcaption')].map((c) => c.textContent);
  const before = stepCaptions();
  const steps = tutorial.querySelectorAll('.wos-steps button');
  steps[steps.length - 1].click();
  tutorial.querySelector('.wos-image-nav button').click();
  page.window.WorkshopilloI18n.setLang('en');
  page.window.WorkshopilloI18n.setLang('es');
  assert.deepEqual(stepCaptions(), before, 'las capturas de cada paso no cambian');
  const shots = steps[steps.length - 1].closest('li').querySelectorAll('.wos-step-shot');
  assert.equal(tutorial.querySelector('.app-shot figcaption').textContent, shots[1].querySelector('figcaption').textContent);
  assert.equal(tutorial.querySelector('.app-shot img').alt, shots[1].querySelector('img').alt);
});
