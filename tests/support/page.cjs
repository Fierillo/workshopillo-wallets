// Carga la página real en jsdom (sin navegador) con los shims mínimos de APIs
// que jsdom no implementa. Ningún shim cambia la lógica de la página.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const INDEX = path.join(__dirname, '..', '..', 'index.html');
const STORAGE_KEY = 'workshopillo-lang';

function installShims(window, { reducedMotion = false } = {}) {
  window.matchMedia = (query) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  });
  Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve() } });
  window.Range.prototype.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 });
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  const dialog = window.HTMLDialogElement.prototype;
  if (!dialog.showModal) dialog.showModal = function () { this.open = true; };
  if (!dialog.close) dialog.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
}

// reducedMotion hace que las animaciones terminen en un cuadro; onWindow permite
// instrumentar la ventana antes de que corra la página.
async function loadPage({ storedLang, reducedMotion, onWindow } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(readFileSync(INDEX, 'utf8'), {
    url: 'http://localhost/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      installShims(window, { reducedMotion });
      if (onWindow) onWindow(window);
      if (storedLang !== undefined) window.localStorage.setItem(STORAGE_KEY, storedLang);
    },
  });
  const { window } = dom;
  if (window.document.readyState === 'loading') {
    await new Promise((resolve) => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  return { window, document: window.document, errors, close: () => window.close() };
}

module.exports = { loadPage, STORAGE_KEY, INDEX };
