# Cambios

## 1.6.0 — 2026-10-16

### Añadido

- **Progreso de descarga y conversión.** Muestra porcentajes basados en bytes o avance real de FFmpeg, también en recuperación. Si falta el total, informa bytes o segundos procesados sin inventar porcentajes.
- **Avisos de capacidad.** Consulta el volumen de recuperación antes de iniciar y cada cinco segundos durante la captura. Advierte por debajo de 1 GiB y solicita finalizar por debajo de 256 MiB. Conserva los originales y comprueba el destino antes de exportar.
- **Perfiles de calidad.** Ligero, Equilibrado y Alta calidad ajustan resolución, FPS y bitrate. Permite resolución y FPS personalizados y conserva los ajustes para las recuperaciones.
- **Selección y prueba de micrófono.** Incluye entrada, volumen de 0–200 % y medidor en ambas vistas. La prueba es explícita, no se guarda ni se reproduce y libera el dispositivo al terminar u ocultar la ventana.

### Validación

- Pruebas unitarias y renderer completo con audio y video sintéticos, volumen cero, liberación de entradas, pausa, señal simulada de espacio crítico y conversión MP4 con progreso real. Queda pendiente la comprobación con escritorio, micrófonos físicos y permisos reales de Windows.

## 1.5.0 — 2026-10-15

### Añadido

- **Pausa manual de video y audio.** Los botones Pausar/Reanudar están disponibles en las vistas normal y compacta. Ctrl + Shift + F8 permite alternarlos desde otra aplicación. El contador excluye el tiempo pausado y Detener permite finalizar desde la pausa.
- **Estado de pausa en la bandeja.** Distingue la pausa manual de la espera por escritura. Vaciar la cola no cancela una pausa manual; reanudar espera si aún quedan datos pendientes.

## 1.4.0 — 2026-10-15

### Cambiado

- **El video se guarda aunque falle la transcripción.** El video se publica antes de generar los subtítulos. Si falta el modelo o falla el reconocimiento, la aplicación confirma el video guardado y conserva el original para reintentar el SRT.
- **Reintento independiente de subtítulos.** En Grabaciones por recuperar, las sesiones con video guardado muestran su ruta y la acción Reintentar subtítulos. Funciona después de reiniciar, sin reconvertir el video y sin sobrescribir SRT existentes. Descartar conserva el video publicado. Si este se movió o eliminó, el original permanece disponible para volver a exportarlo.

### Validación

- Las pruebas automatizadas comprueban fallos, persistencia, reintento sin reconversión, protección de SRT existentes y conservación del original cuando falta el video publicado. La grabación real con micrófono y el reconocimiento con whisper.cpp requieren comprobación manual.

## 1.3.1 — 2026-10-15

### Cambiado

- La ayuda de **Atajos de teclado** se consulta dentro de **Acerca de la aplicación**. Se elimina el botón independiente del pie de la ventana para evitar accesos duplicados; **F1** abre directamente la sección de atajos.

## 1.3.0 — 2026-10-15

### Añadido

- **Captura mediante atajos globales.** Inicia con Ctrl+Shift+F9, detén con Ctrl+Shift+F10 y muestra la ventana con Ctrl+Shift+F11, incluso desde otra aplicación. Ctrl+Shift+M mantiene el cambio de vista compacta.
- **Más acciones de teclado y ayuda integrada.** Guarda, actualiza fuentes, cambia audio, abre configuración, información y recuperación; F1 y el pie de la app muestran los atajos y su disponibilidad.
- **Actualización con cierre conservando capturas.** El instalador detecta procesos en la ubicación que va a actualizar, solicita el cierre de versiones compatibles y espera antes de reemplazar archivos. Mantiene los datos y ofrece abrir la nueva versión al finalizar.

### Cambiado

- Una segunda ejecución activa la instancia existente en lugar de abrir otra aplicación.
- El cierre del programa permite terminar la ventana después de conservar la sesión, también cuando lo solicita el instalador.

### Limitaciones conocidas

- La primera actualización desde 1.2.0 o versiones anteriores requiere salir desde la bandeja y pulsar Reintentar; esas versiones no incluyen el protocolo de cierre automático. El instalador no las termina por la fuerza.
- Los atajos globales ocupados por otro programa funcionan únicamente con la ventana principal en primer plano y se identifican en la ayuda.

## 1.2.0 — 2026-10-15

### Añadido

- **Estado actual en el icono de la bandeja.** El texto emergente y el menú muestran preparación, grabación, pausa por escritura, transcripción, conversión y guardado. El contador de grabaciones por recuperar permanece visible al cambiar de estado.
- **Información completa de la aplicación.** La opción «Acerca de la aplicación», al pie de la ventana principal, abre una ventana independiente con versión, autor, funciones, formatos, instrucciones, transcripción, recuperación y requisitos.

## 1.1.0 — 2026-10-15

### Añadido

- **Recuperación de capturas interrumpidas.** Cada grabación conserva su original en una subcarpeta `Recuperación` dentro de la carpeta de videos configurada. Una nueva captura siempre comienza en otro archivo.
- **Ventana de grabaciones pendientes.** Un aviso en la ventana principal y una opción en el icono de la bandeja permiten revisar, guardar o descartar las capturas conservadas.
- **Reintento de guardado y transcripción.** Si el proceso se interrumpe, se puede volver a guardar desde el video original y generar la transcripción desde el inicio.
- **Salida con conservación.** La opción «Conservar y salir» finaliza la captura actual y conserva sus archivos para continuar después.

### Limitaciones conocidas

- La reparación de un WebM interrumpido depende de que los fragmentos recibidos formen un video legible. La aplicación conserva el original cuando la reparación falla.
- Las pruebas automatizadas cubren la persistencia y validación de sesiones. La interrupción de una captura real y la interacción con la ventana de recuperación aún requieren comprobación manual.
