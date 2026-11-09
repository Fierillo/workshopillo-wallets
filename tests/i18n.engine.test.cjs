const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadObject(name) {
  const re = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n        \\};`);
  const m = source.match(re);
  assert(m, `missing ${name}`);
  return JSON.parse('{' + m[1] + '}');
}

test('phrases y messages tienen EN para claves dinámicas del ábaco', () => {
  const phrases = loadObject('phrases');
  const messagesBlock = source.match(/const messages = \{([\s\S]*?)\n        \};/);
  assert(messagesBlock, 'messages');
  assert.match(messagesBlock[1], /abacus\.send/);
  assert.match(messagesBlock[1], /Send 10 sats/);
  assert.match(messagesBlock[1], /Payment in progress/);
  assert.equal(phrases['A favor'], 'Pros');
  assert.equal(phrases['Código abierto'], 'Open source');
  assert.equal(phrases['Enviar 10 sats'], 'Send 10 sats');
  assert.ok(Object.keys(phrases).length >= 200);
});

test('htmlPhrases conserva énfasis del título hero', () => {
  const htmlPhrases = loadObject('htmlPhrases');
  assert.match(
    htmlPhrases['Bitcoin no es caro, ni lento, y te lo voy a demostrar'],
    /<em>and I'll prove it to you<\/em>/,
  );
});


test('el traductor no aplana hijos y los dots conservan span oculto en markup', () => {
  assert.doesNotMatch(
    source,
    /onlyPhrasing[\s\S]{0,80}textContent = phrases/,
    'No debe aplanar markup con textContent sobre elementos con hijos',
  );
  assert.match(source, /closest\("\.chapter-nav"\) && el\.tagName === "A"\) return/);
  const nav = source.match(/<nav class="chapter-nav"[\s\S]*?<\/nav>/);
  assert(nav, 'nav presente');
  const spans = [...nav[0].matchAll(/<a[^>]*>\s*<span\b[^>]*>[^<]+<\/span>\s*<\/a>/g)];
  assert.ok(spans.length >= 10, `cada dot envuelve un span (hay ${spans.length})`);
  assert.match(source, /\.chapter-nav span \{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});
