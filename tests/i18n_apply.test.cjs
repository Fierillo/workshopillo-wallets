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

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Minimal DOM stub — no browser. */
function el(tag, html) {
  const node = {
    tagName: tag.toUpperCase(),
    childNodes: [],
    children: [],
    dataset: {},
    classList: { contains: () => false },
    closest: () => null,
    getAttribute: () => null,
    appendChild(child) {
      this.childNodes.push(child);
      if (child.tagName) this.children.push(child);
      child.parent = this;
      return child;
    },
    set innerHTML(v) {
      this.childNodes = [];
      this.children = [];
      this._html = v;
      // very small parser for <strong>x</strong> text
      const m = String(v).match(/^<strong>([^<]*)<\/strong>([\s\S]*)$/);
      if (m) {
        const strong = el('strong');
        strong.textContent = m[1];
        this.appendChild(strong);
        if (m[2]) this.appendChild({ nodeType: 3, nodeValue: m[2], remove() { const i = this.parent.childNodes.indexOf(this); if (i >= 0) this.parent.childNodes.splice(i, 1); } });
        return;
      }
      this._text = String(v).replace(/<[^>]+>/g, '');
    },
    get innerHTML() {
      if (this._html != null && !this.childNodes.length) return this._html;
      return this.childNodes.map((n) => {
        if (n.nodeType === 3) return n.nodeValue;
        if (n.tagName === 'STRONG') return `<strong>${n.textContent}</strong>`;
        return n.textContent || '';
      }).join('');
    },
    get textContent() {
      if (this.childNodes.length) {
        return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
      }
      return this._text || '';
    },
    set textContent(v) {
      this.childNodes = [];
      this.children = [];
      this._text = v;
      this._html = v;
    },
  };
  if (html != null) node.innerHTML = html;
  return node;
}

function makeTranslator(phrases, htmlPhrases = {}) {
  let current = 'es';
  function captureSource(node) {
    if (!node.dataset.i18nSrcHtml) node.dataset.i18nSrcHtml = node.innerHTML;
    if (!node.dataset.i18nSrcText) node.dataset.i18nSrcText = norm(node.textContent);
  }
  function applyStrongPrefix(node, key) {
    const elKids = node.children;
    if (elKids.length !== 1 || elKids[0].tagName !== 'STRONG') return false;
    const strong = elKids[0];
    captureSource(strong);
    const labelKey = strong.dataset.i18nSrcText;
    const labelEn = phrases[labelKey];
    const fullEn = phrases[key];
    if (!labelEn || !fullEn || !fullEn.startsWith(labelEn)) return false;
    const restEn = fullEn.slice(labelEn.length);
    strong.textContent = labelEn;
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) n.remove();
    }
    node.appendChild({
      nodeType: 3,
      nodeValue: restEn.startsWith(' ') ? restEn : ' ' + restEn.trimStart(),
      remove() {
        const i = this.parent.childNodes.indexOf(this);
        if (i >= 0) this.parent.childNodes.splice(i, 1);
      },
    });
    node.childNodes[node.childNodes.length - 1].parent = node;
    return true;
  }
  function translateElement(node) {
    captureSource(node);
    const key = node.dataset.i18nSrcText;
    if (!key) return;
    if (current === 'es') {
      node.innerHTML = node.dataset.i18nSrcHtml;
      return;
    }
    if (htmlPhrases[key]) {
      node.innerHTML = htmlPhrases[key];
      return;
    }
    if (!phrases[key]) return;
    if (node.children.length === 0) {
      node.textContent = phrases[key];
      return;
    }
    applyStrongPrefix(node, key);
  }
  return {
    setLang(lang) { current = lang; },
    apply(node) { translateElement(node); },
    get lang() { return current; },
  };
}

test('tabla: strong+texto aplica EN sin borrar strong y vuelve a ES', () => {
  const phrases = loadObject('phrases');
  const esHtml = '<strong>¿Tiene LN Address?</strong> Elegís tu alias en el dominio de la comunidad. LaWallet ofrece la dirección; LNcurl o NWC conecta la wallet receptora.';
  const node = el('p', esHtml);
  const i18n = makeTranslator(phrases);
  i18n.setLang('en');
  i18n.apply(node);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].tagName, 'STRONG');
  assert.equal(node.children[0].textContent, 'Does it have an LN Address?');
  assert.match(node.textContent, /You choose your alias/);
  assert.doesNotMatch(node.innerHTML, /Elegís/);
  i18n.setLang('es');
  i18n.apply(node);
  assert.equal(node.innerHTML, esHtml);
  assert.match(node.textContent, /Elegís tu alias/);
});

test('agradecimientos strong de credits aplican y revierten', () => {
  const phrases = loadObject('phrases');
  const es = 'A todos los que vinieron hoy';
  const node = el('strong', es);
  // plain text strong: stub parser stored as text
  node.textContent = es;
  node.dataset = {};
  const i18n = makeTranslator(phrases);
  i18n.setLang('en');
  i18n.apply(node);
  assert.equal(node.textContent, 'To everyone who came today');
  i18n.setLang('es');
  i18n.apply(node);
  assert.equal(node.textContent, es);
});

test('motor en index captura fuentes antes de mutar y soporta strong prefix', () => {
  assert.match(source, /nodes\.forEach\(captureSource\)/);
  assert.match(source, /function applyStrongPrefix/);
  assert.match(source, /querySelectorAll\("[^"]*\bstrong\b/);
});
