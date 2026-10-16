# Fiabilidad y edición Implementation Plan

**Goal:** Aplicar seis mejoras y verificarlas en la aplicación por etapas.
**Architecture:** Ampliar recuperación y tareas cancelables del proceso principal;
añadir políticas pequeñas de audio y codificadores, y controles en las ventanas existentes.
**Tech Stack:** Electron 44, Node.js, JavaScript y FFmpeg existentes.
**Spec:** ../specs/2026-10-16-fiabilidad-edicion-design.md

## Restricciones

- Sin dependencias nuevas ni eliminación de originales.
- Perfil y medios aislados para pruebas; ninguna suspensión real del equipo.
- Cada etapa termina con prueba en Electron antes de implementar la siguiente.
- Mantener cambios previos de 1.7.0; no publicar en GitHub sin una nueva solicitud.

## Etapas

- [x] Fiabilidad. Modificar `main.js`, `preload.js`, `src/renderer.js`: bloqueo de
  suspensión automática, evento de suspensión y sincronización de fragmentos.
  Probar captura de tres minutos, finalización por evento y recuperación tras salida abrupta.
- [x] Cancelación. Añadir token en el proceso principal, IPC restringido y botones
  en principal, recuperación y Biblioteca. Probar detener FFmpeg real y reintentar.
- [x] Audio. Añadir política de avisos y separar la señal de micrófono de la mezcla.
  Probar señal, silencio, saturación, pausa y limpieza en el renderer completo.
- [x] Recorte visual. Añadir rangos y vista previa de intervalo en `src/library.*`.
  Probar controles con teclado y reproducción detenida en el final seleccionado.
- [x] Biblioteca. Añadir metadatos, orden y edición de nombre con validación IPC.
  Probar persistencia tras recarga y que el archivo original conserva su nombre.
- [x] Aceleración. Añadir sondeo real y alternativa por software para guardar y recortar.
  Probar conversión real y fallo de hardware controlado con salida decodificable.
- [x] Revisión final, pruebas completas, documentación, versión e instalador verificado.

## Registro de comprobaciones

Los resultados de cada etapa se anotarán aquí y en `dist/verification`.

- Fiabilidad: `stage-stability/stability-result.json`, captura de 180092 ms,
  decodificada. Memoria privada del renderer: 90460 a 94164 KiB en tres minutos.
  Suspensión simulada y recuperación de una segunda captura tras salida abrupta
  aprobadas (`stage-stability/recovery-result.json`).
- Cancelación: `stage-cancel/result.json`, guardado y recorte reales cancelados
  y reintentados. Original intacto y temporales retirados.
- Audio: `capture-improvements/result.json`, medidores de ambas entradas, aviso
  de saturación y silencio, pausa, espacio crítico, conversión y liberación.
  Mini barra verificada a 760 × 128 puntos; captura visual guardada.
- Recorte: `stage-timeline/result.json`, tiempos sincronizados y reproducción
  detenida en 0.80 s antes de guardar MP4 y SRT.
- Biblioteca: `stage-library/result.json`, metadatos, nombre persistido tras
  recarga, orden y búsqueda sin coincidencias. Original sin cambio de ruta.
- Aceleración: `stage-acceleration/result.json`, Intel Quick Sync disponible,
  exportación y recorte reales; alternativa ante fallo controlado decodificada.
- Revisión adicional: una reutilización (promisify), dos correcciones de calidad
  (cancelación al salir y espera del cierre del archivo), una de eficiencia
  (no reconvertir errores de disco/entrada). Sin hallazgos descartados.
- Mejoras adicionales: recarga de interfaz conservando la captura tras fallo
  real del renderer (`stage-crash/result.json`), búsqueda sin coincidencias y
  actualización de controles para archivos movidos.
- `stage-quit/result.json`: todos los conversores cerrados, sin relanzamiento
  ni archivos temporales después de solicitar cierre durante una conversión real.
- `stage-devices/result.json`: micrófono físico abierto y liberado; no se guarda
  ni reproduce audio. No equivale a validar reconocimiento de voz o calidad acústica.
- Límite: pruebas prolongadas de tres minutos, sin afirmar cobertura de horas ni
  suspensión real. El equipo del usuario no se suspendió.
- Comprobación final: `npm run check`, `npm test` (65 aprobadas, sin omisiones),
  `git diff --check` y aplicación completa con temporizador real de un minuto,
  todos aprobados. La biblioteca verifica también teclado y archivos movidos.
- Instalador `dist/WinScreen-Recorder-1.8.0-Setup.exe`: compilación con salida 0,
  151938517 bytes; SHA-256
  `A2992871DE8633CBCE84ABF621FA151F9B87C011C31AF26B3A643C49FD8B36BD`.
- Paquete: 47 archivos coinciden con las fuentes. EXE 1.8.0 ejecutado sin ajustes
  especiales de JavaScript; ventanas principal y Biblioteca, fuentes disponibles
  y cierre normal comprobados. Evidencia en `dist/verification/packaged-1.8`.
- Se aplicó la adaptación de AJV solo al proceso de construcción y compresión 7,
  conservando validación. Sin cambios de dependencias ni ajustes del runtime.
- Estado al cerrar la validación local: código e instalador locales; sin commits ni publicación de esta
  iteración en GitHub. Copia previa en `dist/verification/pre-1.8/workspace.tar`.
