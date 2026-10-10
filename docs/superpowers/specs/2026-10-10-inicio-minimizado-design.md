# Inicio minimizado con Windows

## Objetivo

Cuando WinScreen Recorder se abra automáticamente al iniciar sesión en Windows, la ventana principal debe quedar minimizada en la barra de tareas. Si la persona abre la aplicación manualmente, debe mostrarse como hasta ahora.

## Diseño aprobado

- Marcar los lanzamientos automáticos registrados por la opción **Iniciar con Windows** con un argumento de línea de comandos dedicado.
- Detectar ese argumento en el proceso principal de Electron y minimizar la ventana al completar `ready-to-show`.
- Mantener el comportamiento habitual para los lanzamientos manuales. El icono y las acciones existentes de la bandeja seguirán permitiendo restaurar la ventana.
- Conservar la ruta del ejecutable del elemento de inicio. Migrar al nuevo argumento las configuraciones existentes que ya estén activadas, para que la consulta y el cambio de la preferencia sigan representando el estado correcto.

## Manejo de errores y compatibilidad

La detección depende del argumento que Electron guarda con el elemento de inicio de Windows. La preferencia **Iniciar con Windows** debe consultar y registrar siempre el mismo conjunto de argumentos. Las configuraciones activas anteriores se migran manteniendo la ruta del ejecutable. No se cambiará la visibilidad al cerrar la ventana ni se alterarán otros modos de captura.

## Verificación

- Ejecutar los chequeos de sintaxis y las pruebas existentes del proyecto.
- Confirmar que un inicio manual muestra la ventana.
- Confirmar que un inicio con el argumento de Windows deja la ventana minimizada y que se puede restaurar desde la bandeja o la barra de tareas.
- Confirmar que activar y desactivar **Iniciar con Windows** conserva el estado correcto.

## Alcance

El cambio se limita al inicio automático de Windows y a la presentación inicial de la ventana. No incluye iniciar grabaciones automáticamente ni ocultar por completo la aplicación en la bandeja.
