# Trabajo en esta presentación

- Mantener la app estática en `index.html`. Node y Playwright son solo herramientas de pruebas; no agregar un framework ni un build a la presentación.
- Todo cambio de comportamiento sigue TDD: un test que falle por el motivo esperado, cambio mínimo, suite completa en verde y recién después refactor.
- Para UI y estilos, probar la interacción o el resultado calculado en Chromium; no buscar fragmentos de HTML/CSS como sustituto del comportamiento.
- Lo existente se protege con tests de regresión y fallos deliberados en memoria. No afirmar que eso convierte su implementación original en TDD.
- Conservar los tests existentes. No borrarlos, debilitarlos ni saltarlos para conseguir verde.
- Ejecutar `npm test`. Para comprobar que los tests detectan regresiones, ejecutar `npm run test:mutations`. Ver preparación y límites en `TESTING.md`.
- No modificar estado del usuario ni archivos de producción para introducir fallos de prueba.
