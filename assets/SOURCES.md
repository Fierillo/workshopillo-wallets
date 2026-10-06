# Fuentes

## Wallet of Satoshi: presentación y respaldo
- wos-logo.svg — logotipo oficial, sin modificar:
  https://www.walletofsatoshi.com/assets/images/wallet-logo.svg
- wos-autocustodia.jpg, wos-lista.jpg, wos-crear.jpg, wos-respaldo.jpg — capturas
  de Android provistas por Fierillo (versión indicada en su menú: 3.4.10 (370)).
  Convertidas a JPEG de 540×1200, sin metadatos del original.
  wos-lista.jpg lleva un círculo y una flecha naranja añadidos para señalar el
  llavero superior, desde donde se abre Backup Wallet. El respaldo se presenta
  después de Create a New Wallet; no se muestran palabras de recuperación.
- wos-sitio.jpg — captura propia del sitio oficial https://www.walletofsatoshi.com/
  a 540×1200, convertida a JPEG. Incluye los enlaces a las tiendas oficiales.
  Las capturas de respaldo contienen solo instrucciones, no palabras de recuperación.
- Modos, instalación y respaldo: https://www.walletofsatoshi.com/#faq
- Flujo manual observado en Android (v3.1.7):
  https://walletscrutiny.com/android/com.livingroomofsatoshi.wallet/
  Settings → Self Custody Mode → respaldo manual/avanzado → desbloqueo →
  12 palabras → confirmación. Los menús de versiones posteriores pueden variar.
  No se incluyen capturas de claves ni se afirma haber probado el flujo en la app actual.

## Fotos de La Crypta (provistas por Fierillo)
Redimensionadas a ≤1200 px de lado largo, JPEG progresivo, sin EXIF.
- lacrypta-fachada.jpg — fachada (fuente original 1080 px, ya muy comprimida: queda en ~270 KB)
- lacrypta-patio.jpg — exposición en el patio
- lacrypta-mesa-de-trabajo.jpg — mesa de trabajo con el banner de La Crypta
- lacrypta-almuerzo.jpg — almuerzo de la comunidad
- lacrypta-veintiuno.jpg — foto grupal en el stand de Veintiuno.lat
- lacrypta-neon-bitcoin.jpg — ₿ de neón sobre la chimenea

## Strike
- strike-logo.svg — logotipo SVG del header de https://strike.me/ (fill currentColor → #ffffff)
- strike-app-inicio.jpg — captura oficial del listado de App Store (Argentina, en español),
  https://apps.apple.com/ar/app/strike-buy-hold-bitcoin/id1488724463 , captura 01:
  https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/84/f3/92/84f392e8-649d-86be-7158-9f45298e3388/01.png/1000x0w.png
  Recortada para quitar el título de marketing; 560 px de ancho.

## ZEUS
- zeus-cashu-demo.mp4 — video de configuración provisto por Fierillo ("zeus demo.mp4").
  Comprimido a H.264, 480×1066, 24 fps, con audio AAC y sin metadatos;
  se conserva el recorrido completo de aproximadamente 43 segundos.
  Se muestra al desplegar la configuración de Cashu, con controles y sin autoplay.
  La guía sigue el asistente observado: Empezar, Repase el cuestionario, Tarifas
  bajas, LDK Node, recomendaciones de mints de cuentas seguidas por ZEUS en
  Nostr, Seleccionar y Crear billetera. La lista incluye Minibits; el video no
  muestra pegar su URL, realizar pagos ni guardar respaldos.
- zeus-logo.svg — https://github.com/ZeusLN/zeus/blob/master/assets/images/SVG/wordmark-black.svg (recoloreado a blanco)
- zeus-canales.jpg — captura oficial del listado de App Store,
  https://apps.apple.com/us/app/zeus-wallet/id1456038895 (pantalla de canales):
  https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/4d/f4/fd/4df4fdf2-eb94-94ce-b67f-7450a7dd9152/Simulator_Screenshot_-_iPhone_17_Pro_Max_-_2026-04-20_at_22.20.55.png/1000x0w.png
  Redimensionada a 560 px de ancho.

## Rayo real (página #lightning)
- rayo-camara-lenta.mp4 (H.264, 560×700, 8.73 s, sin audio), rayo-camara-lenta.webm (VP9, misma edición),
  rayo-camara-lenta-poster.jpg (frame de 7.3 s: el canal del rayo después del retorno).
- Fuente: "Lightning strikes in slow motion (240fps) in Muurame, Finland" — autor: MrNousia
  (YouTube: https://www.youtube.com/@MrNousia), 22-06-2021.
  https://commons.wikimedia.org/wiki/File:Lightning_strikes_in_slow_motion_(240fps)_in_Muurame,_Finland.webm
- Licencia: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ (requiere atribución: crédito visible bajo el panel).
- Modificaciones: recortado al tramo 1.65 s–4.60 s del original (líderes escalonados + retorno + apagado),
  ralentizado ×3 con fundido de frames (minterpolate blend, 30 fps), reencuadrado (crop 900×1125 desde x=180, y=200:
  saca el marco de la ventana), escalado a 560×700, fundido de entrada/salida para el loop, audio eliminado.
- Retorno del rayo (frame más brillante, medido con ffmpeg): t = 4.633 s del clip editado. La animación de la red
  usa ese instante como momento del pago.

## Portada: íconos de wallets (tambor 3D)
Todos convertidos a WebP 128×128 (lossy ~80) desde el PNG oficial. Ícono de App Store = artworkUrl512 del listado US (iTunes Lookup → `…/256x256bb.png`).

- icono-lawallet.webp — repo oficial LaWallet: https://github.com/lawalletio/lawallet-web
  `public/icons/icon-512x512.png` →
  https://raw.githubusercontent.com/lawalletio/lawallet-web/main/public/icons/icon-512x512.png
- icono-wos.webp — App Store: https://apps.apple.com/us/app/wallet-of-satoshi/id1438599608
  https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/f3/37/45/f33745f8-1796-e8a5-9e3b-1a5e5969fc80/AppIcon-0-0-1x_U007emarketing-0-1-85-220.png/256x256bb.png
- icono-tether.webp — App Store: https://apps.apple.com/us/app/tether-wallet-usdt-bitcoin/id6759002210
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/1f/a6/7a/1fa67ad5-1e6c-8021-d2a3-a9ca98413ee8/AppIcon-0-0-1x_U007ephone-0-1-85-220.png/256x256bb.png
- icono-cashapp.webp — App Store: https://apps.apple.com/us/app/cash-app/id711923939 (Block, Inc.)
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/14/95/84/149584fa-47e1-a3a4-6bf1-bf3ed932ee95/AppIcon-0-0-1x_U007ephone-0-1-0-sRGB-85-220.png/256x256bb.png
- icono-strike.webp — App Store: https://apps.apple.com/us/app/strike-buy-hold-bitcoin/id1488724463
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/4a/e3/00/4ae30037-0d25-051b-d90f-1b0a9337de5f/GlassAppIcon-Live-0-0-1x_U007ephone-0-1-0-0-P3-85-220.png/256x256bb.png
- icono-blink.webp — App Store: https://apps.apple.com/us/app/blink-bitcoin-wallet/id1531383905
  https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9a/fa/47/9afa4724-d8c1-6325-1f20-5f783532f1de/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/256x256bb.png
- icono-phoenix.webp — App Store: https://apps.apple.com/us/app/phoenix-wallet/id1544097028 (ACINQ)
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/ea/c9/97/eac997ee-90c8-f87b-cb56-d3adf4b930aa/AppIcon-Green-0-1x_U007emarketing-0-0-0-8-0-0-85-220-0.png/256x256bb.png
- icono-muun.webp — App Store: https://apps.apple.com/us/app/muun-wallet/id1482037683
  https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/21/1b/0b/211b0b71-92d2-b8a0-e3f9-6059490daa36/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.png
- icono-bitkit.webp — App Store: https://apps.apple.com/us/app/bitkit-bitcoin-wallet/id6502440655 (Synonym)
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/88/8e/98/888e989a-ac22-0d60-c278-21380501f97c/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/256x256bb.png
- icono-blixt.webp — repo oficial Blixt (smolcars/blixt-wallet):
  `ios/BlixtWallet/Images.xcassets/AppIcon.appiconset/blixt-wallet-70-1024.png` →
  https://raw.githubusercontent.com/smolcars/blixt-wallet/master/ios/BlixtWallet/Images.xcassets/AppIcon.appiconset/blixt-wallet-70-1024.png
  (sin listado en iOS App Store)
- icono-bluewallet.webp — App Store: https://apps.apple.com/us/app/bluewallet-bitcoin-wallet/id1376878040
  https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9d/a2/be/9da2be33-53fd-c52d-8148-a2f8b80de938/AppIcon-0-0-1x_U007epad-0-1-85-220.png/256x256bb.png
- icono-zeus.webp — App Store: https://apps.apple.com/us/app/zeus-wallet/id1456038895
  https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e9/23/72/e92372ff-d372-eb45-0903-9df4daac9f8d/AppIcon-0-0-1x_U007epad-0-1-85-220.png/256x256bb.png
- icono-aqua.webp — App Store: https://apps.apple.com/us/app/aqua-wallet/id6468594241 (AQUA Wallet, io.aquawallet.ios)
  https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/44/7c/8b/447c8bd9-4392-ca80-cdca-7844d0337ea7/AppIcon-0-0-1x_U007epad-0-1-sRGB-85-220.png/256x256bb.png

## LaWallet (página #wallets-lawallet)
- lawallet-logo.svg — logotipo vectorial oficial (wordmark blanco + isotipo de color, se lee bien sobre fondo oscuro),
  repo https://github.com/lawalletio/lawallet-nwc , `apps/web/public/logos/lawallet.svg` →
  https://raw.githubusercontent.com/lawalletio/lawallet-nwc/main/apps/web/public/logos/lawallet.svg
  Sin modificar.
- lawallet-app-inicio.jpg — captura de la app provista por Fierillo, redimensionada a 560×743.
- lawallet-connection-map.jpg — captura del Connection Map provista por Fierillo, 900×426.
- Texto de la página basado en https://lawallet.io y https://docs.lawallet.io/docs/vision
  (autocustodia progresiva: alias/redirect → NWC de cortesía vía lncurl → NWC propia → self-hosted; MIT).

## Comparación de wallets: código y custodia

Revisado el 05-10-2026. «Código» se refiere a la app, no a todos los servidores,
proveedores o protocolos que utiliza. Un repositorio público no demuestra que la
app instalada sea reproducible ni que todo el servicio haya sido auditado.

Repositorios de las apps abiertas y licencias declaradas:
- LaWallet: https://github.com/lawalletio/lawallet-nwc — MIT.
- Blink: https://github.com/blinkbitcoin/blink-mobile — MIT.
- Phoenix: https://github.com/ACINQ/phoenix — Apache-2.0.
- Muun (Android): https://github.com/muun/apollo — MIT.
- Bitkit: https://github.com/synonymdev/bitkit — MIT.
- Blixt: https://github.com/smolcars/blixt-wallet — MIT.
- BlueWallet: https://github.com/BlueWallet/BlueWallet — MIT.
- ZEUS: https://github.com/ZeusLN/zeus — AGPL-3.0; ver LICENSE.
- Aqua: https://github.com/AquaWallet/aqua-wallet — MIT.

Apps cerradas / componentes abiertos:
- Wallet of Satoshi: https://walletscrutiny.com/android/com.livingroomofsatoshi.wallet/
  (apartado Build Verifications: código no disponible). Modos de custodia:
  https://www.walletofsatoshi.com/#faq ; no equiparar sus claves Spark con ausencia de confianza en operadores.
- Cash App: https://walletscrutiny.com/android/com.squareup.cash/
  (apartado Build Verifications: código no disponible).
- Strike: app propietaria; https://strike.me/legal/tos/ . Publicar herramientas
  de API no equivale a publicar el código completo de la app.
- Tether Wallet: app propietaria según https://wallet.tether.io/application-terms/ .
  https://github.com/tetherto/tether-wallet-app-releases distribuye APK, no el código de la app.
  WDK es abierto: https://wdk.tether.io/ . Por eso se presenta como «Mixto»,
  aclarando expresamente que la app sigue siendo cerrada.

La comparación usa explicaciones para principiantes, no una auditoría de seguridad:
separar claves, disponibilidad del código y dependencia de otros operadores.
Modos actuales de Blink: https://www.blink.sv/ .
Respaldos y activos de Tether Wallet: https://wallet.tether.io/ .
