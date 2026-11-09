# Pruebas

La presentación sigue siendo HTML estático, sin build ni dependencias de ejecución.
Las herramientas Node son solo de desarrollo: runner nativo `node:test`, aserciones
nativas, jsdom para cargar la página real sin navegador y Playwright Core para
la suite de navegador, que corre aparte.

## Preparación

Requiere Python 3 y Node 20 o posterior.

```sh
npm ci
npm test              # Python + Node con jsdom, sin navegador
```

La suite de navegador necesita Chromium:

```sh
npx playwright-core install chromium
npm run test:browser
```

Si ya tenés Chromium instalado, podés evitar otra descarga:

```sh
CHROMIUM_EXECUTABLE=/ruta/al/chrome npm run test:browser
CHROMIUM_EXECUTABLE=/ruta/al/chrome npm run test:mutations
```

## Cobertura

- `tests/test_page.py`: IDs, referencias, navegación, recursos, alt, estructura de desplegables y header con el selector EN/ES.
- `tests/i18n.test.cjs` (jsdom): toda clave usada existe en ES y EN y no hay huérfanas; en EN no queda español visible ni en atributos, también tras usar galerías y ampliación; ida y vuelta ES→EN→ES idéntica, también para el texto que genera el JS (galerías, ábaco, pasos de WoS y ampliación); ningún bloque escucha el cambio de idioma para reponer texto; persistencia del idioma y rechazo de valores inválidos; todos los scripts parsean y la página carga sin errores.
- `tests/css.test.cjs`: toda variable CSS usada está declarada, no hay variables de `:root` sin uso ni reglas para clases o ids inexistentes.
- `tests/browser.test.cjs`: badges, saldos paso a paso, fichas independientes sin atravesar nodos, repetición del ejemplo, WoS y su galería, ampliaciones con teclado y restauración del foco, escenas originales y reproducción, Cashu desplegable y su video (reemplazo de imagen, reproducción real, pausa al cerrar y sin autoplay), movimiento reducido y navegación/contenido en 1366, 390 y 320 px.
  La tabla comprueba texto dentro del área interior de los badges, encabezados
  en una línea y columnas sin solapamiento en 20 anchos entre 320 y 1920 px.
  Otro Chromium usa `--blink-settings=minimumFontSize=16` para reproducir una
  fuente mínima de navegador en 1366, 1571 y 1920 px: verifica especialmente
  que código y encabezado no desborden ni invadan el indicador de apertura.
  Las mutaciones incluyen badges demasiado angostos y una columna de código
  reducida a 70 px para verificar que las pruebas detectan ambos fallos.
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
