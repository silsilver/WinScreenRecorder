# Ventana de información de la aplicación

Fecha: 2026-10-15
Solicitud: añadir al pie de la aplicación una opción que abra una ventana con su información y funciones.

## Diseño

El botón «Acerca de la aplicación» abre una ventana independiente, única y no modal. El contenido sigue los colores existentes e incluye un índice para consultar funciones, formatos, pasos de captura, transcripción, guardado y recuperación, uso de ventanas y bandeja, privacidad, requisitos, autor y componentes.

El nombre, la versión y el autor se consultan en el proceso principal a partir de los metadatos de la aplicación. Las descripciones corresponden a funciones implementadas; se explican la descarga inicial del modelo, la transcripción local y los límites de recuperación. La ventana solo tiene acceso a una consulta de información, con contexto aislado, sandbox y validación de su origen. No puede ejecutar acciones de grabación o abrir navegación externa.

## Comprobación

Revisar sintaxis, ejecutar la suite existente y comprobar la ventana con Electron a tamaño normal y reducido. Verificar el acceso del botón, la reutilización de la ventana y el rechazo de consultas IPC desde otro origen.
