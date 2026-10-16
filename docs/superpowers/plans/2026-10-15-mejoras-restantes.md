# Mejoras restantes Implementation Plan

**Goal:** Completar progreso, espacio en disco, perfiles de calidad y controles de micrófono.
**Architecture:** Módulos de opciones, progreso, capacidad y audio; integración en IPC y renderer existentes. Conservar información necesaria en cada sesión.
**Tech Stack:** Electron, Node.js, Web Audio, MediaRecorder y FFmpeg existentes.
**Spec:** ../specs/2026-10-15-mejoras-restantes-design.md

## Tasks

- [x] Implementar y probar opciones, análisis de progreso y política de espacio.
- [x] Integrar backend: metadatos, conversión, descarga, consultas y límites de disco.
- [x] Integrar perfiles, controles de audio, prueba y medidor en ambas vistas.
- [x] Revisar, ejecutar pruebas y validación nativa, actualizar ayuda y generar instalador.

## Constraints

Sin dependencias nuevas; porcentajes basados en datos reales; mantener permisos
de audio y originales recuperables. No instalar ni publicar automáticamente.

## Evidencia de verificación — 2026-10-16

- `npm test`: 50 pruebas aprobadas; `npm run check` y `git diff --check`: correctos.
- `scripts/verify-capture-improvements.cjs`, ejecutado con Electron y
  `--js-flags=--jitless`: renderer completo, perfil Ligero a 15 FPS/2 Mbps,
  micrófono sintético elegido por ID exacto, nivel de señal, volumen cero y
  liberación de las entradas. Pausa y aviso crítico simulado completan la captura.
  La función FFmpeg de producción convierte a MP4, informa avance real y termina
  en 100 %; el MP4 se decodifica con código 0. Resultado e imágenes en
  `dist/verification/capture-improvements/`.
- Se inspeccionaron la interfaz de audio y Ajustes compactos a 760 px de ancho,
  con el renderer real y servicios de backend simulados. No hay desbordamiento
  horizontal. La prueba no accede a escritorio ni dispositivos físicos.
- La revisión corrigió una carrera al actualizar dispositivos y retiró consultas
  de disco de la cola de escritura. La supervisión durante la captura está en
  el proceso principal, con una única consulta pendiente como máximo. El medidor
  reutiliza una muestra para ambas vistas.
- Se compararon 34 archivos del ASAR con las fuentes, incluida la versión 1.6.0.
- Los primeros intentos de compilación fallaron en el entorno de ejecución y el
  generador AJV del esquema. Un lanzador temporal en
  `dist/verification/capture-improvements/build.cjs` desactiva solamente la
  optimización de código generado por AJV, conservando la validación del esquema,
  y usa `node --jitless` y `nsis.differentialPackage=false`. No modifica dependencias
  ni la configuración permanente. Se genera el instalador completo, sin blockmap.
- El lanzador temporal completó la compilación con código 0. Instalador:
  `dist/WinScreen-Recorder-1.6.0-Setup.exe`. Las fuentes empaquetadas coinciden con
  las probadas; se conserva el instalador anterior como archivo separado.
  Tamaño: 140773953 bytes. SHA-256:
  `B7641AE4815414472CA6E2748C53A9F9ECA902F58E679A682D61FC75902EC994`.
- Pendiente manual: micrófonos físicos, permisos de Windows, captura del escritorio,
  descarga real del modelo y agotamiento real de un volumen. Las pruebas simulan
  espacio crítico y descarga, sin llenar el disco ni descargar de nuevo el modelo.
  No se instala ni se publica en servicios remotos.
