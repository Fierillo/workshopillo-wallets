const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FORBIDDEN_ES = [
  'Sobre mí',
  '¿Son ciertas?',
  'El ábaco',
  'Las claves',
  'Cómo funciona Spark',
  'Créditos',
  'Empezar el recorrido',
  'Más sobre mí en fierillo.world',
  'Autocustodia no elimina la confianza',
  'Modelo de confianza: al menos un operador',
  'LN Address mediante Lightning Box',
  '¿Tiene LN Address?',
  '¿Quién tiene las claves?',
  '¿El código es abierto?',
  'Una práctica guiada para entender Bitcoin Lightning',
  'vía Wikimedia Commons · editado',
  'Comparar wallets',
  'El mito',
  'Las rutas',
  'La red Lightning',
  'Conceptos',
  'Taller',
  'Inicio',
];

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function loadEnDom() {
  const i18nScript = inlineScripts(source).find((s) => s.includes('WorkshopilloI18n') && s.includes('STORAGE_KEY'));
  assert.ok(i18nScript, 'i18n script');
  let body = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
  const headBits = [];
  const titleM = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) headBits.push(`<title data-i18n="meta.title">${titleM[1]}</title>`);
  const metaM = source.match(/<meta[^>]*name=["']description["'][^>]*>/i);
  if (metaM) headBits.push(metaM[0]);
  const harness = `<!doctype html><html lang="es"><head>${headBits.join('\n')}</head><body>${body}<script>${i18nScript}</script></body></html>`;
  const dom = new JSDOM(harness, { url: 'http://127.0.0.1:39179/index.html', runScripts: 'dangerously' });
  const { window } = dom;
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  assert.ok(window.WorkshopilloI18n, 'WorkshopilloI18n');
  window.WorkshopilloI18n.setLang('en');
  return dom;
}

function collectVisibleCorpus(doc) {
  const parts = [];
  const walker = doc.createTreeWalker(doc.body, doc.defaultView.NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (!p || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(p.tagName)) continue;
    if (p.closest('svg')) continue;
    const text = String(n.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (text.length >= 2) parts.push(text);
  }
  for (const attr of ['aria-label', 'title', 'alt']) {
    doc.querySelectorAll(`[${attr}]`).forEach((el) => {
      if (el.closest('svg')) return;
      const text = (el.getAttribute(attr) || '').replace(/\s+/g, ' ').trim();
      if (text.length >= 2) parts.push(text);
    });
  }
  const meta = doc.querySelector('meta[name="description"]');
  if (meta?.content) parts.push(meta.content);
  if (doc.title) parts.push(doc.title);
  return parts.join('\n');
}

test('messages incluye claves de huecos EN (nav/hero/meta/notes/tabla/crédito)', () => {
  const m = source.match(/const messages = \{([\s\S]*?)\n        \};/);
  assert(m, 'messages');
  const body = m[1];
  const es = body.match(/es:\s*\{([\s\S]*?)\n          \},\s*\n\s*en:/)[1];
  const en = body.match(/en:\s*\{([\s\S]*?)\n          \}\s*$/)[1];
  const keys = [
    'nav.inicio', 'nav.speaker', 'nav.mito', 'nav.capas', 'nav.abaco', 'nav.rutas', 'nav.mapa',
    'nav.conceptos', 'nav.llaves', 'nav.sparkHow', 'nav.taller', 'nav.tabla', 'nav.creditos',
    'hero.cta', 'speaker.link', 'meta.description', 'meta.title',
    'tether.note', 'spark.trustCaption', 'blixt.note',
    'tabla.col.address', 'tabla.col.keys', 'tabla.col.code',
    'rutas.credit',
  ];
  for (const key of keys) {
    assert.match(es, new RegExp(`'${key.replace(/\./g, '\\.')}'\\s*:`), `falta es ${key}`);
    assert.match(en, new RegExp(`'${key.replace(/\./g, '\\.')}'\\s*:`), `falta en ${key}`);
  }
  assert.doesNotThrow(() => new Function(`void ({${es}})`));
  assert.doesNotThrow(() => new Function(`void ({${en}})`));
});

test('EN: no reaparecen los textos ES de la auditoría en visible+attrs+meta', () => {
  const dom = loadEnDom();
  const corpus = collectVisibleCorpus(dom.window.document);
  const hits = FORBIDDEN_ES.filter((s) => corpus.includes(s));
  assert.deepEqual(hits, [], `restos ES en EN: ${hits.join(' | ')}`);
  // spot-check expected EN
  assert.match(corpus, /Start the tour|Home/);
  assert.match(corpus, /via Wikimedia Commons/);
  assert.match(dom.window.document.querySelector('meta[name="description"]').content, /guided practice|Lightning/i);
  assert.equal(dom.window.WorkshopilloI18n.lang, 'en');
  // round-trip
  dom.window.WorkshopilloI18n.setLang('es');
  assert.equal(dom.window.document.documentElement.lang, 'es');
  assert.match(
    collectVisibleCorpus(dom.window.document),
    /Empezar el recorrido|Más sobre mí en fierillo.world/,
  );
  dom.window.close();
});
