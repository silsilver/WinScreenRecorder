# Pausa manual Implementation Plan

**Goal:** Pausar y reanudar una grabación desde ambas vistas o un atajo global.
**Architecture:** Controlador de causas de pausa y tiempo acumulado compartido por renderer y pruebas. Mantener fase recording para conservar guardado y recuperación.
**Tech Stack:** Electron, MediaRecorder y JavaScript existentes.
**Spec:** ../specs/2026-10-15-pausa-manual-design.md

## Constraints

Sin dependencias nuevas. Mantener umbrales de escritura 24/8 MiB. No reanudar
durante pausa manual ni después de detener. Mantener cambios anteriores.

## Tasks

- [x] Probar e implementar controlador de pausa y tiempo con reloj controlado.
- [x] Integrar botones, atajo, cola de escritura y estado de bandeja.
- [x] Actualizar ayuda y versión; revisar simplicidad y ejecutar pruebas completas.
- [x] Generar instalador, comparar fuentes empaquetadas y documentar límites.

## Validación

- `npm test`: 43 pruebas aprobadas; `npm run check` y `git diff --check`: correctos.
- `scripts/verify-recording-pause.cjs`, ejecutado con Electron y perfil temporal:
  MediaRecorder real, video canvas y audio sintetizado, sin capturar escritorio ni
  micrófono. Estados observados: paused, paused, recording, paused, recording;
  duración pausada aproximada: 726 ms. Termina estando en pausa.
- El WebM generado se convirtió con los parámetros MP4 de producción y se
  decodificó con FFmpeg, código 0. Para la comprobación de decodificación se
  conserva la base temporal del archivo con `-enc_time_base:v demux`; el sumidero
  null con su base temporal predeterminada había avisado de timestamps repetidos.
- Se inspeccionaron imágenes de ambas vistas en estado controlado, con el HTML y
  CSS de producción y el renderer desactivado. Los botones caben a 760 px de ancho
  compacto. Esto verifica la disposición, no una sesión de interacción completa.
- Revisión de reutilización y calidad: sin hallazgos. Eficiencia: se añadió limpieza
  del perfil temporal. Se mantuvieron los eventos nativos y del controlador para
  reflejar estado real; se omitió añadir una caché de IPC para estos pocos eventos.
- El empaquetado inicial falló en 7zip; el siguiente produjo el instalador pero
  falló durante blockmap. Se completó con código 0 mediante:
  `node --jitless node_modules/electron-builder/cli.js --win nsis --x64 --prepackaged dist/win-unpacked --config.nsis.differentialPackage=false`.
  Es un instalador completo; no se generó blockmap ni se cambió la configuración
  permanente del proyecto. Diez archivos del ASAR coinciden con las fuentes y su
  versión es 1.5.0.
- SHA-256 del instalador: `C29B81B376E3E0659ED10B4903BE6AD8E93D08FF210E9DB4C5276DD8CF90DA50`.
- Pendiente manual: captura de escritorio y micrófono reales, interacción completa
  en ambas vistas y activación global desde otra aplicación. No se instaló ni se
  publicaron cambios remotos. Se conservaron los cambios previos de 1.4.0.
