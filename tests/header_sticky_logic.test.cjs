const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** Pure mirrors of the sticky helpers (keep aligned with index.html). */
function inflowIndexVisible(rect, headerBand, innerHeight) {
  return rect.bottom > headerBand && rect.top < innerHeight;
}

function pickActiveChapter(chapters, scrollY, innerHeight) {
  const line = scrollY + innerHeight * 0.35;
  let active = null;
  for (const ch of chapters) {
    if (ch.top <= line) active = ch;
  }
  return active;
}

function shouldShowHeaderTitle(active, indexVisible) {
  if (!active || !active.html || active.id === 'inicio') return false;
  return !indexVisible;
}

test('layout del header reserva columna izquierda y EN/ES a la derecha', () => {
  assert.match(source, /\.site-header \{[\s\S]*?display:\s*grid;/);
  assert.match(source, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(source, /\.lang-switch \{[\s\S]*?grid-column:\s*2/);
  assert.match(source, /\.site-header \.chapter-index\.is-idle \{[\s\S]*?visibility:\s*hidden/);
  assert.doesNotMatch(
    source,
    /getElementById\("header-section-title"\)[\s\S]{0,400}?\.hidden\s*=\s*true/,
    'el título no debe usar el atributo hidden (display:none mueve EN/ES)',
  );
  assert.doesNotMatch(source, /id="section-sticky"/);
  assert.match(source, /<p class="chapter-index is-idle" id="header-section-title"/);
});

test('umbral: título in-flow arriba del header de 44px deja de contar como visible', () => {
  const headerBand = 44;
  const vh = 900;
  assert.equal(
    inflowIndexVisible({ top: -80, bottom: 20 }, headerBand, vh),
    false,
    'bottom bajo el header band => ya salió por arriba',
  );
  assert.equal(
    inflowIndexVisible({ top: 60, bottom: 90 }, headerBand, vh),
    true,
    'aún debajo del header => visible',
  );
  assert.equal(
    inflowIndexVisible({ top: 950, bottom: 980 }, headerBand, vh),
    false,
    'todavía debajo del viewport no cuenta como visible en zona de contenido',
  );
});

test('selección de sección por línea 0.35 y hero sin título de header', () => {
  const chapters = [
    { id: 'inicio', top: 0, html: '' },
    { id: 'speaker', top: 900, html: '01 <span>Sobre mí</span>' },
    { id: 'lacrypta', top: 1800, html: '02 <span>Comunidad</span>' },
  ];
  const vh = 900;
  assert.equal(pickActiveChapter(chapters, 0, vh).id, 'inicio');
  assert.equal(shouldShowHeaderTitle(pickActiveChapter(chapters, 0, vh), false), false);

  const midSpeaker = pickActiveChapter(chapters, 1000, vh);
  assert.equal(midSpeaker.id, 'speaker');
  assert.equal(shouldShowHeaderTitle(midSpeaker, true), false, 'in-flow visible => header title idle');
  assert.equal(shouldShowHeaderTitle(midSpeaker, false), true, 'in-flow arriba => header title on');

  const intoLacrypta = pickActiveChapter(chapters, 1900, vh);
  assert.equal(intoLacrypta.id, 'lacrypta');
});

test('hide temporal no debe vaciar innerHTML en el código fuente', () => {
  assert.match(source, /function hideSticky\(clear\)/);
  assert.match(source, /hideSticky\(false\)/);
  assert.match(source, /hideSticky\(true\)/);
  // clearing only when clear===true
  assert.match(source, /if \(clear\) \{\s*label\.innerHTML = ""/);
});
