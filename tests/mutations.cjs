const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Fallos deliberados sobre el HTML servido en memoria, nunca sobre los archivos.
const mutations = {
  'columna-codigo-demasiado-angosta': {
    test: 'la última columna',
    from: 'clamp(82px, 12vw, 180px)',
    to: '70px',
  },
  'texto-desborda-badge': {
    test: 'el texto completo de cada badge',
    from: '</style>',
    to: '.wallet-option summary .claim-tag { width: 40px !important; } </style>',
  },
  'badge-depende-del-dominio': {
    test: 'los badges de código',
    from: '.claim-tag.is-open,\n      .wallet-option.is-open .wallet-option-code',
    to: '.claim-tag.is-open:not(.wallet-option-code),\n      .wallet-option-code[href^="https://github.com/"]',
  },
  'abaco-no-actualiza-saldos': {
    test: 'el ábaco mueve fichas',
    from: 'balances.forEach((balance, index) => balance.textContent = totals[index] + " sats");',
    to: '// Fallo deliberado: no actualizar saldos.',
  },
  'wos-galeria-no-avanza': {
    test: 'WoS selecciona pasos',
    from: 'current = 1 - current;',
    to: 'current = 0;',
  },
  'abaco-fichas-quietas': {
    test: 'el ábaco mueve fichas',
    from: 'bead.setAttribute("cx", from + (to - from) * fraction);',
    to: 'bead.setAttribute("cx", from);',
  },
  'abaco-atraviesa-el-nodo': {
    test: 'el ábaco mueve fichas',
    from: 'const to = ports[index][1] - 48;',
    to: 'const to = ports[index][1] + 34;',
  },
  'ampliacion-deshabilitada': {
    test: 'red y video se amplían',
    from: 'if (dialog.open) return;',
    to: 'return; // Fallo deliberado: no abrir.',
  },
  'escena-clonada': {
    test: 'red y video se amplían',
    from: 'lbMedia.appendChild(stage);',
    to: 'lbMedia.appendChild(stage.cloneNode(true));',
  },
  'cashu-abierto-de-entrada': {
    test: 'Cashu se despliega',
    from: '<details class="cashu-route">',
    to: '<details class="cashu-route" open>',
  },
  'contenido-oculto-en-movil': {
    test: 'todas las páginas se navegan',
    from: '</style>',
    to: '@media (max-width: 500px) { .app-copy { display: none !important; } } </style>',
  },
  'codigo-abierto-rojo': {
    test: 'los badges distinguen custodia',
    from: 'color: #86d993;',
    to: 'color: #f28b82;',
  },
  'demo-cashu-sigue-reproduciendo-oculta': {
    test: 'abrir Cashu reemplaza la captura',
    from: 'if (!route.open) video.pause();',
    to: '// Fallo deliberado: dejar reproduciendo al cerrar.',
  },
};

function mutate(html, name) {
  const mutation = mutations[name];
  assert(mutation, `Mutación desconocida: ${name}`);
  assert(html.includes(mutation.from), `El punto de mutación ya no existe: ${name}`);
  return html.replace(mutation.from, mutation.to);
}

if (require.main === module) {
  for (const [name, mutation] of Object.entries(mutations)) {
    const result = spawnSync(process.execPath, ['--test', `--test-name-pattern=${mutation.test}`, path.join(__dirname, 'browser.test.cjs')], {
      env: { ...process.env, REGRESSION_MUTATION: name }, encoding: 'utf8', timeout: 60000,
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.error, undefined, output);
    assert.notEqual(result.status, 0, `El test no detectó ${name}\n${output}`);
    assert(output.includes('ERR_ASSERTION'), `Falló por infraestructura, no por el comportamiento esperado:\n${output}`);
    console.log(`Detectado: ${name}`);
  }
}

module.exports = { mutate };
