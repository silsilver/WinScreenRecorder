# Biblioteca y controles completos

Autorizado: aplicar las cinco mejoras propuestas y decidir su integración. Además,
el usuario pide ejecutar el programa, probarlo y corregir los errores encontrados.

Biblioteca independiente, accesible desde ambas vistas, con hasta 100 capturas,
vista previa, abrir archivo/carpeta, importar capturas existentes y quitar solo el
registro. Persistir después del guardado; nunca confundir error de historial con
pérdida del video. Las acciones reciben identificadores, no rutas arbitrarias.

Recorte básico en Biblioteca: inicio y final en segundos, siempre copia MP4,
original intacto, nombres sin colisión. Recortar y desplazar el SRT si existe.
Validar límites y bloquear operaciones simultáneas con captura/guardado. No
prometer corte sin recodificación ni sustituir el archivo original.

Atajos globales configurables en Biblioteca: validar combinación, duplicados y
conflictos; aplicar y persistir como transacción, restaurando los anteriores si
falla. Actualizar ayuda y alternativa local. Restaurar valores predeterminados.

Temporizador de 0 a 1440 minutos (0 sin límite), persistido en ambas vistas;
cuenta tiempo grabado sin pausas y detiene normalmente, sin descartar.

Vigilar tracks: fin de fuente o audio finaliza conservando; interrupción temporal
informa sin detener. Retirar listeners al terminar. Mantener el aviso visible
hasta la próxima captura. La Biblioteca no elimina archivos de usuario.

Verificación: unitarias, renderer sintético y programa real con perfil separado,
ventana de captura de prueba, IPC real, guardado, biblioteca, recorte, ajustes y
recuperación. Dispositivos físicos no se sustituyen por afirmar una prueba sintética.
