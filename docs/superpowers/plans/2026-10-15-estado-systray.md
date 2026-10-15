# Estado de la aplicación en la bandeja — Plan de implementación

> Implementar en la rama actual, sin delegar.

**Goal:** Mostrar el estado real de la aplicación al consultar el icono de la bandeja.

**Architecture:** Un módulo determina el texto a partir de la captura, la sesión y la operación activa. El proceso principal actualiza el texto emergente y el menú; la ventana comunica únicamente fases permitidas de captura y pausa.

**Tech Stack:** Electron, Node.js y JavaScript existentes.

**Spec:** `docs/superpowers/specs/2026-10-15-estado-systray-design.md`.

## Trabajo

- [x] Crear `src/tray-status.js` con los estados permitidos y prioridad de procesos activos.
- [x] Integrar actualizaciones en `main.js`, conservar el contador de recuperaciones y evitar reconstruir el menú sin cambios.
- [x] Conectar `preload.js` y `src/renderer.js` para preparación, grabación, pausa y finalización.
- [x] Añadir el módulo a la revisión de sintaxis, documentar el cambio y ejecutar las comprobaciones existentes.
- [x] Generar el instalador actualizado.

## Límites

La función presenta información; no añade controles de grabación. Los datos enviados por la ventana se validan y no pueden sustituir una transcripción o guardado activo. La comprobación automatizada no confirma cómo Windows dibuja el texto emergente.

## Ampliación solicitada durante la implementación

**Spec:** `docs/superpowers/specs/2026-10-15-informacion-aplicacion-design.md`.

- [x] Crear `src/about.html`, `src/about.css`, `src/about.js` y `src/about-preload.js` con información real y metadatos de la versión instalada.
- [x] Añadir el botón al pie de la aplicación y una ventana independiente única con consulta IPC de solo lectura validada por origen.
- [x] Comprobar la interfaz con Electron en dos tamaños y revisar los límites de navegación e IPC.

## Comprobaciones realizadas

- Revisión de sintaxis y 18 pruebas existentes: correctas.
- Integración simulada: transiciones de bandeja, prioridad de guardado, contador, ventana única y validación de origen correctos.
- Ventana comprobada en Electron a 860 y 640 px de ancho, sin desbordamiento horizontal; botón inferior visible y funcional.
- No se ha comprobado visualmente el texto emergente del icono dentro del área de notificación de Windows.

Entrega: sincronizar el repositorio autorizado y comprobar las referencias remotas después de publicar.
