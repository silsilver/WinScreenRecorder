# Cambios

## 1.1.0 — 2026-10-15

### Añadido

- **Recuperación de capturas interrumpidas.** Cada grabación conserva su original en una subcarpeta `Recuperación` dentro de la carpeta de videos configurada. Una nueva captura siempre comienza en otro archivo.
- **Ventana de grabaciones pendientes.** Un aviso en la ventana principal y una opción en el icono de la bandeja permiten revisar, guardar o descartar las capturas conservadas.
- **Reintento de guardado y transcripción.** Si el proceso se interrumpe, se puede volver a guardar desde el video original y generar la transcripción desde el inicio.
- **Salida con conservación.** La opción «Conservar y salir» finaliza la captura actual y conserva sus archivos para continuar después.

### Limitaciones conocidas

- La reparación de un WebM interrumpido depende de que los fragmentos recibidos formen un video legible. La aplicación conserva el original cuando la reparación falla.
- Las pruebas automatizadas cubren la persistencia y validación de sesiones. La interrupción de una captura real y la interacción con la ventana de recuperación aún requieren comprobación manual.
