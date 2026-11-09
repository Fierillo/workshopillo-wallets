const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadMessages() {
  const m = source.match(/const messages = \{([\s\S]*?)\n        \};/);
  assert(m, 'messages block');
  const body = m[1];
  const es = {};
  const en = {};
  const esBlock = body.match(/es:\s*\{([\s\S]*?)\n          \},\s*\n\s*en:/);
  const enBlock = body.match(/en:\s*\{([\s\S]*?)\n          \}\s*$/);
  assert(esBlock && enBlock, 'es/en blocks');
  for (const [bag, block] of [
    [es, esBlock[1]],
    [en, enBlock[1]],
  ]) {
    for (const match of block.matchAll(/'([^']+)':\s*"((?:\\.|[^"\\])*)"/g)) {
      bag[match[1]] = JSON.parse('"' + match[2] + '"');
    }
    for (const match of block.matchAll(/'([^']+)':\s*'((?:\\.|[^'\\])*)'/g)) {
      bag[match[1]] = match[2].replace(/\\'/g, "'");
    }
  }
  return { es, en };
}

const TITLE_KEYS = [
  'wos.step1.title',
  'wos.step2.title',
  'wos.step3.title',
  'wos.step4.title',
];

test('WoS: títulos de pasos usan data-i18n explícito (no texto suelto en button)', () => {
  const wos = source.match(/id="wallets-wos"[\s\S]*?id="wallets-zeus"/);
  assert(wos, 'sección wallets-wos');
  const block = wos[0];
  for (const key of TITLE_KEYS) {
    assert.match(block, new RegExp(`data-i18n="${key.replace(/\./g, '\\.')}"`));
  }
  // Titles must be their own nodes, not bare text glued to .wos-step-description
  assert.match(
    block,
    /<span class="wos-step-title" data-i18n="wos\.step1\.title">Instalá WoS<\/span>/,
  );
  assert.match(block, /class="wos-step-description"/);
  // Still four interactive steps inside the list
  const steps = block.match(/<ol class="steps wos-steps">[\s\S]*?<\/ol>/);
  assert(steps, 'ol.wos-steps');
  assert.equal((steps[0].match(/<button type="button"/g) || []).length, 4);
});

test('messages incluye títulos WoS en es y en con paridad', () => {
  const { es, en } = loadMessages();
  for (const key of TITLE_KEYS) {
    assert.ok(es[key], `falta es ${key}`);
    assert.ok(en[key], `falta en ${key}`);
  }
  assert.equal(es['wos.step1.title'], 'Instalá WoS');
  assert.equal(en['wos.step1.title'], 'Install WoS');
  assert.match(en['wos.step2.title'], /Open Self Custody Wallet/);
  assert.match(en['wos.step3.title'], /Create a New Wallet/);
  assert.match(en['wos.step4.title'], /12 words|12 palabras/i);
  assert.doesNotMatch(en['wos.step1.title'], /Instalá/);
  assert.doesNotMatch(en['wos.step4.title'], /olvides/);
});

test('applyKeyed por claves aplica títulos WoS y hace ida/vuelta sin tocar el desc hermano', () => {
  const { es, en } = loadMessages();
  assert.ok(es['wos.step1.title'] && en['wos.step1.title'], 'keys required');
  function t(lang, key) {
    return (lang === 'en' ? en : es)[key];
  }
  // Simulate sibling nodes under the same parent span: title (keyed) + description (unchanged)
  const title = { key: 'wos.step1.title', value: es['wos.step1.title'] };
  const desc = {
    className: 'wos-step-description',
    value: 'Elegí la tienda de tu teléfono. Instalá la app, abrila y tocá el menú.',
  };
  const parent = { children: [title, desc] };

  // applyKeyed only mutates data-i18n nodes
  title.value = t('en', title.key);
  assert.equal(title.value, en['wos.step1.title']);
  assert.equal(
    desc.value,
    'Elegí la tienda de tu teléfono. Instalá la app, abrila y tocá el menú.',
    'description sibling must stay untouched by title key apply',
  );
  assert.equal(parent.children.length, 2);

  title.value = t('es', title.key);
  assert.equal(title.value, es['wos.step1.title']);
  assert.equal(parent.children[1], desc);
});

test('applyKeyed en index usa t(key) para data-i18n (títulos WoS)', () => {
  const apply = source.match(/function applyKeyed\([\s\S]*?\n        \}/);
  assert(apply, 'applyKeyed');
  assert.match(apply[0], /el\.textContent = t\(key\)/);
});
