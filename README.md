# Workshopillo · Wallets Lightning

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)

> Web presentation for La Crypta's Lightning wallets workshop (Buenos Aires): Bitcoin and Lightning explained with animations, key custody, and a wallet comparison. Content is in Spanish.

Presentación web del workshop de wallets Lightning de [La Crypta](https://lacrypta.ar) (Belgrano, Buenos Aires).

Recorrido: el mito de que «Bitcoin es caro y lento», Lightning explicado con ábacos y animaciones de la red, custodia de claves (custodial vs. autocustodial), Lightning Address, Spark, y una comparativa de wallets para elegir la tuya.

## Uso

Es HTML estático, sin build ni dependencias de ejecución. Abrí `index.html` en el navegador o servilo localmente:

```sh
python3 -m http.server 8000
```

y entrá a http://localhost:8000.

## Estructura

- `index.html`: toda la presentación (HTML, CSS y JS).
- `assets/`: imágenes, logos y videos.
- `tests/`: tests Python y de navegador (Playwright + Chromium).

## Tests

```sh
npm ci
npx playwright-core install chromium
npm test
npm run test:mutations
```

Detalles y límites en [`TESTING.md`](TESTING.md). Reglas de trabajo en [`AGENTS.md`](AGENTS.md).
