# Teclado y cierre durante actualización — Plan

> Implementar directamente en esta rama, sin delegar.

**Goal:** Ampliar las acciones de teclado y preparar actualizaciones que conserven trabajo pendiente.

**Architecture:** Un catálogo compartido de atajos alimenta registro, resolución y ayuda. Un módulo de ciclo de vida usa el bloqueo de instancia de Electron; un comprobador del instalador solicita cierre y espera los procesos de la ruta exacta.

**Tech Stack:** Electron, Node.js, PowerShell y NSIS existentes.

**Spec:** `docs/superpowers/specs/2026-10-15-teclado-actualizacion-design.md`.

- [x] Implementar catálogo, atajos globales y acciones locales con las restricciones existentes de captura.
- [x] Documentar y mostrar atajos y su disponibilidad, navegación y comportamiento de instalación.
- [x] Añadir transferencia de instancia, señal de actualización y cierre conservando sesiones.
- [x] Personalizar NSIS con detección por ruta, soporte para versiones anteriores y reintento sin terminación forzada.
- [x] Ejecutar las pruebas y comprobar interfaz, activación de captura y protocolo de cierre en entornos aislados.
- [x] Compilar el instalador y verificar su contenido antes de publicar.

## Evidencia de comprobación

- Revisión de JavaScript y 27 pruebas automatizadas correctas.
- Captura de una fuente propia de Electron con la ventana oculta: inicio, fragmentos de video, detención y guardado/reintento por teclado correctos; sin capturar el escritorio del usuario.
- Ayuda revisada visualmente en Electron y sin desbordamiento a 860 y 640 px.
- Copia de prueba aislada: detección exacta de ruta, cierre mediante instancia, conservación y tiempo de espera sin terminación forzada correctos.
- Integración del proceso principal: bloqueo durante diálogos, activación de usuario y cierre de ventana después de conservar sesión correctos.
- No se ejecutó una instalación sobre la copia de uso del usuario ni se modificó su registro de instalación durante las comprobaciones.

- Instalador 1.3.0 compilado: 17 archivos de aplicación coinciden con el código actual y el archivo de capacidades de actualización está incluido.
