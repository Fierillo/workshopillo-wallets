const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadMessages() {
  const m = source.match(/const messages = \{([\s\S]*?)\n        \};/);
  assert(m, 'messages block');
  // Evaluate as JS object via Function — messages uses single-quoted keys
  const body = m[1];
  // Pull es/en with a lightweight scan
  const es = {};
  const en = {};
  const esBlock = body.match(/es:\s*\{([\s\S]*?)\n          \},\s*\n\s*en:/);
  const enBlock = body.match(/en:\s*\{([\s\S]*?)\n          \}\s*$/);
  assert(esBlock && enBlock, 'es/en blocks');
  for (const [bag, block] of [[es, esBlock[1]], [en, enBlock[1]]]) {
    for (const match of block.matchAll(/'([^']+)':\s*"((?:\\.|[^"\\])*)"/g)) {
      bag[match[1]] = JSON.parse('"' + match[2] + '"');
    }
    for (const match of block.matchAll(/'([^']+)':\s*'((?:\\.|[^'\\])*)'/g)) {
      bag[match[1]] = match[2].replace(/\\'/g, "'");
    }
  }
  return { es, en };
}

test('ambas rutas ZEUS usan details.zeus-route con summary título+blurb', () => {
  const zeus = source.match(/id="wallets-zeus"[\s\S]*?id="wallets-lawallet"/);
  assert(zeus, 'sección zeus');
  const block = zeus[0];
  const details = [...block.matchAll(/<details class="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(details.length, 2, 'dos details');
  assert.ok(details.every((c) => c.split(/\s+/).includes('zeus-route')));
  assert.ok(details[0].split(/\s+/).includes('cashu-route'), 'ruta 1 conserva cashu-route para el video');
  assert.match(block, /data-i18n="zeus\.route1\.title"/);
  assert.match(block, /data-i18n="zeus\.route1\.blurb"/);
  assert.match(block, /data-i18n="zeus\.route2\.title"/);
  assert.match(block, /data-i18n="zeus\.route2\.blurb"/);
  assert.match(block, /data-i18n="zeus\.route2\.lead"/);
  // Route 2 must not remain a bare strong-only list item
  assert.doesNotMatch(
    block,
    /<li><strong>Ruta 2 · Canales propios/,
  );
});

test('messages incluye claves ZEUS en es y en con paridad', () => {
  const { es, en } = loadMessages();
  const keys = [
    'zeus.intro',
    'zeus.route1.title',
    'zeus.route1.blurb',
    'zeus.route1.lead',
    'zeus.route1.step1',
    'zeus.route1.step2',
    'zeus.route1.step3',
    'zeus.route1.step4',
    'zeus.route1.step5',
    'zeus.route1.noteMint',
    'zeus.route1.noteRisk',
    'zeus.route1.noteVideo',
    'zeus.route2.title',
    'zeus.route2.blurb',
    'zeus.route2.lead',
    'zeus.after',
  ];
  for (const key of keys) {
    assert.ok(es[key], `falta es ${key}`);
    assert.ok(en[key], `falta en ${key}`);
  }
  assert.match(en['zeus.route1.title'], /Route 1/);
  assert.match(en['zeus.route2.title'], /Route 2/);
  assert.match(en['zeus.route2.lead'], /JIT/);
  assert.doesNotMatch(en['zeus.route1.lead'], /Pagás|necesitás|confiás/);
});

test('applyKeyed usa data-i18n / data-i18n-html con t(key), no heurística de textContent', () => {
  const apply = source.match(/function applyKeyed\([\s\S]*?\n        \}/);
  assert(apply, 'applyKeyed');
  assert.match(apply[0], /dataset\.i18nHtml|dataset\["i18nHtml"\]|data-i18n-html/);
  assert.match(apply[0], /\bt\(key\)|\bt\(el\.dataset/);
  assert.doesNotMatch(apply[0], /translateElement\(el\)/);
});


test('applyKeyed por claves preserva markup HTML y hace ida/vuelta', () => {
  const { es, en } = loadMessages();
  function t(lang, key) {
    return (lang === 'en' ? en : es)[key];
  }
  function apply(lang, nodes) {
    for (const node of nodes) {
      if (node.html) node.value = t(lang, node.key);
      else node.value = t(lang, node.key);
    }
  }
  const title = { key: 'zeus.route1.title', value: es['zeus.route1.title'] };
  const step = { key: 'zeus.route1.step1', value: es['zeus.route1.step1'], html: true };
  apply('en', [title, step]);
  assert.equal(title.value, en['zeus.route1.title']);
  assert.equal(step.value, en['zeus.route1.step1']);
  assert.match(step.value, /<strong>Start<\/strong>/);
  assert.match(step.value, /<strong>Review the questionnaire<\/strong>/);
  apply('es', [title, step]);
  assert.equal(title.value, es['zeus.route1.title']);
  assert.equal(step.value, es['zeus.route1.step1']);
  assert.match(step.value, /<strong>Empezar<\/strong>/);
});
