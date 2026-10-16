# Guardado independiente Implementation Plan

**Goal:** Guardar el video aunque falle la transcripción, permitiendo reintentar el SRT.
**Architecture:** Publicar primero el video; persistir su ruta en recuperación y generar el SRT por separado. Continuar una sesión publicada reintenta solo los subtítulos.
**Tech Stack:** Electron, Node.js, FFmpeg y whisper.cpp existentes.
**Spec:** ../specs/2026-10-15-guardado-independiente-design.md

## Constraints

Sin dependencias nuevas. Conservar originales hasta completar subtítulos o descarte
explícito. No sobrescribir SRT existentes. No publicar ni instalar automáticamente.

## Tasks

- [x] Ampliar el manifiesto compatible con registros previos y probar persistencia.
- [x] Separar la publicación del video del SRT y probar errores y reintentos con archivos temporales.
- [x] Actualizar mensajes de ventana principal, recuperación y ayuda.
- [x] Revisar simplicidad, ejecutar comprobaciones y pruebas, generar instalador y documentar límites.

## Resultado

- `npm test`: 35 pruebas aprobadas. El flujo de guardado se ejecuta con archivos
  temporales y sustitutos de conversión/transcripción; no usa audio del usuario.
- `npm run check` y `git diff --check`: correctos.
- Revisión de reutilización y eficiencia: sin hallazgos. Revisión de calidad:
  simplificada la selección de etiquetas y corregida la conservación del original
  cuando el video publicado ya no está disponible.
- El comando de empaquetado vía npm se detuvo sin diagnóstico. La ejecución directa
  `node node_modules/electron-builder/cli.js --win nsis --x64`, con diagnóstico
  de electron-builder, completó el instalador 1.4.0 y su blockmap.
- Se compararon ocho archivos del paquete con las fuentes locales y se comprobó
  la versión empaquetada. El generador normaliza package.json al empaquetarlo.
- Pendiente manual: captura real, audio, whisper.cpp y recorrido visual en Windows.
  Instalador generado; no se ejecutó la instalación ni se publicaron cambios remotos.
