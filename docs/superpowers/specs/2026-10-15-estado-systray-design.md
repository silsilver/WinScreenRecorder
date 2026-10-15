# Estado actual en el icono de la bandeja

Fecha: 2026-10-15
Alcance solicitado: mostrar el estado actual de la aplicación en su icono del área de notificación.

## Comportamiento

- El texto al pasar el cursor muestra el nombre de la aplicación, su estado actual y la cantidad de grabaciones por recuperar, cuando exista alguna.
- La primera fila del menú del icono muestra el mismo estado y no ejecuta ninguna acción. Las opciones Abrir, Recuperar y Salir conservan su función.
- Incluir preparación de captura, cuenta atrás, grabación, pausa automática por escritura, finalización, captura de imagen, transcripción, conversión y guardado.
- Los procesos activos del proceso principal tienen prioridad sobre mensajes anteriores de la ventana principal. La información debe seguir actualizándose con las ventanas ocultas y al recuperar una grabación desde la ventana independiente.
- Al terminar, cancelar o fallar una operación, volver al estado real: lista para grabar o grabación pendiente de guardar/reintentar.

## Implementación y límites

El proceso principal administra el texto del icono y el menú. La ventana principal solo comunica una fase de captura y una marca de pausa, validadas mediante su canal IPC existente de confianza. Los mensajes del transcriptor y las sesiones activas determinan los estados de procesamiento. Usar el icono actual y texto breve en español.

## Comprobación

Ejecutar la revisión de sintaxis y la suite existente. Comprobar en la integración que un mensaje de la ventana no sustituya el estado de transcripción y que cambiar el estado no borre el contador de recuperaciones. La comprobación visual del área de notificación requiere interacción con Windows.
