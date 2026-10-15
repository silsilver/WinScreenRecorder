# Teclado y actualización con la aplicación abierta

Fecha: 2026-10-15. Solicitudes: ampliar acciones de teclado, permitir captura con la app oculta y documentar la actualización desde el instalador.

## Teclado

Registrar cuatro atajos globales: Ctrl+Shift+F9 inicia la captura seleccionada, Ctrl+Shift+F10 detiene o cancela la cuenta atrás, Ctrl+Shift+F11 muestra la ventana y Ctrl+Shift+M alterna la vista compacta. Inicio y detención son acciones independientes para que la repetición de una tecla no invierta la acción. Las acciones reutilizan los controles y sus restricciones de estado. La captura global mantiene la activación de usuario requerida por la captura de pantalla.

Añadir atajos locales para guardar, actualizar fuentes, enfocarlas, seleccionar una porción, cambiar audio, abrir configuración, información, recuperación y ayuda. Respetar campos de texto, diálogos, composición de texto y teclas nativas de navegación. Ningún atajo descarta una grabación. F1 y el pie abren la sección de teclado de la ventana informativa. Registrar y mostrar la disponibilidad real de los atajos globales; si están ocupados, permitirlos localmente.

## Instalador

Mantener una instancia por perfil. Una ejecución del mismo programa con `--prepare-for-update` solicita al proceso existente que cierre mediante su flujo de conservación. El proceso auxiliar termina sin abrir una ventana. Solo iniciar la instalación después de confirmar que ya no existen procesos en la ruta exacta que se va a modificar.

El instalador comprueba la carpeta destino y la instalación anterior registrada. Solicita cierre, espera hasta 45 segundos y ofrece reintentar o cancelar. No fuerza terminaciones. Un archivo de capacidades incluido desde 1.3.0 identifica el protocolo de cierre. Las versiones anteriores requieren salir manualmente desde la bandeja; no se intenta ejecutarles un argumento que no entienden. Conservar datos de usuario y recuperación. Ofrecer ejecutar la nueva versión al finalizar con la opción marcada por defecto.

## Evidencia y límites

Pruebas de resolución de teclas, composición, repetición, campos de texto, alcance y transferencia de instancia. Comprobación de la interfaz en Electron y del protocolo de cierre en una copia de prueba aislada, sin instalar sobre la aplicación del usuario. Compilar el instalador NSIS personalizado. Documentar estas funciones en Acerca de, README y registro de cambios.

Referencia de API: [globalShortcut de Electron](https://www.electronjs.org/docs/latest/api/global-shortcut/) permite registrar acciones fuera del foco de la aplicación e informa si el sistema rechaza un atajo ocupado. La ayuda utiliza ese resultado de registro.
