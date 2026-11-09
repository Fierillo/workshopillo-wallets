// Contratos del CSS sobre la página real (sin navegador).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { INDEX } = require('./support/page.cjs');

const { document } = new JSDOM(readFileSync(INDEX, 'utf8')).window;
const css = document.querySelector('style').textContent;
const scripts = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n');
const markup = (() => {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('style').forEach((s) => s.remove());
  return clone.outerHTML;
})();

test('toda variable CSS usada está declarada y toda variable de :root se usa', () => {
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const m of scripts.matchAll(/setProperty\("(--[\w-]+)"/g)) declared.add(m[1]);
  const used = new Set([...(css + scripts).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((name) => !declared.has(name)), [], 'variables sin declarar');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const rootVars = [...root.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(rootVars.filter((name) => !used.has(name)), [], 'variables de :root sin uso');
});

test('ninguna regla CSS apunta a clases o ids que no existen en el HTML ni en el JS', () => {
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@;]+)\{/g)].map((m) => m[1].trim());
  const missing = new Set();
  for (const selector of selectors) {
    for (const [, kind, name] of selector.matchAll(/([.#])([a-zA-Z][\w-]*)/g)) {
      if (kind === '#' && /^[0-9a-f]{3,8}$/i.test(name)) continue;
      if (!new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(markup + scripts)) missing.add(kind + name);
    }
  }
  assert.deepEqual([...missing], []);
});
