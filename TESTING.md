# Pruebas

La presentación sigue siendo HTML estático, sin build ni dependencias de ejecución.
Las herramientas Node son solo de desarrollo: runner nativo `node:test`, aserciones
nativas y Playwright Core para manejar Chromium. Se mantienen los 7 tests Python.

## Preparación

Requiere Python 3 y Node 20 o posterior.

```sh
npm ci
npx playwright-core install chromium
npm test
```

Si ya tenés Chromium instalado, podés evitar otra descarga:

```sh
CHROMIUM_EXECUTABLE=/ruta/al/chrome npm test
CHROMIUM_EXECUTABLE=/ruta/al/chrome npm run test:mutations
```

## Cobertura

- `tests/test_page.py`: IDs, referencias, navegación, recursos, alt y estructura de desplegables.
- `tests/browser.test.cjs`: badges, saldos paso a paso, fichas independientes sin atravesar nodos, repetición del ejemplo, WoS y su galería, ampliaciones con teclado y restauración del foco, escenas originales y reproducción, Cashu desplegable y su video (reemplazo de imagen, reproducción real, pausa al cerrar y sin autoplay), movimiento reducido y navegación/contenido en 1366, 390 y 320 px.
- Los tests de animación del ábaco controlan el reloj del navegador: no esperan varios segundos reales ni dependen del rendimiento para capturar cada paso.
- Cada test usa un contexto nuevo y un servidor local en un puerto libre. No usa la wallet ni el almacenamiento de tu navegador habitual.

## Comprobar que fallan cuando corresponde

```sh
npm run test:mutations
```

Se introducen fallos deliberados en el HTML servido **en memoria**, sin editar
`index.html`. El comando solo pasa si los tests seleccionados detectan cada fallo
mediante una aserción: badges mal coloreados, saldos congelados, fichas quietas o
atravesando nodos, galería que no avanza, ampliación deshabilitada, escena clonada,
Cashu abierto de entrada, contenido oculto en móvil y demo de Cashu que sigue
reproduciendo al ocultarse.

Estas comprobaciones complementan las regresiones de lo ya implementado; no son
TDD retroactivo. Los cambios nuevos deben seguir RED → GREEN → REFACTOR, un
comportamiento por vez. La corrección de los colores dependientes del dominio de
la referencia sí fue guiada por un test que primero falló.

## Límites

No se promete cobertura total. La suite no certifica la exactitud financiera,
la seguridad o disponibilidad de una mint, los precios actuales de los LSP,
el contenido de webs externas ni el comportamiento en Safari/Firefox.
Tampoco sustituye una revisión visual humana de tipografía e imágenes. No se
realizan pagos ni conexiones a wallets reales durante las pruebas.
