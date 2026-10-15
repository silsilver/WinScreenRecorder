# Recuperación de grabaciones interrumpidas

Fecha: 2026-10-15
Proyecto: WinScreen Recorder
Estado: Especificación revisada y aprobada por el usuario

## Objetivo

Conservar las capturas que se interrumpan durante la grabación, el guardado o la transcripción, y permitir al usuario recuperarlas desde una ventana dedicada. Cada nueva captura comienza en un archivo independiente.

## Almacenamiento

- Escribir el WebM original de cada captura en una subcarpeta `Recuperación` dentro de la carpeta de videos usada por la aplicación. La ruta predeterminada será `Videos\\WinScreenRecorder\\Recuperación`; si el usuario configuró otra carpeta de guardado, crear `Recuperación` dentro de esa carpeta.
- Mientras el original siga pendiente, darle un nombre único que lo identifique como recuperación y como archivo parcial. No presentarlo como un video terminado.
- Guardar un manifiesto pequeño por sesión en los datos de usuario de la aplicación. Debe registrar identificador, ruta relativa segura del original, fecha, fuente descriptiva, presencia de audio y estado de la operación; no guardar texto de transcripción ni datos ajenos a la recuperación.
- No borrar el original ni el manifiesto hasta que el video y, cuando corresponda, el SRT estén finalizados correctamente, o hasta que el usuario descarte expresamente la sesión.
- Validar manifiestos y rutas al leerlos. Ignorar entradas inválidas sin abrir rutas arbitrarias.
- Escribir manifiestos y salidas temporales de manera atómica para que una interrupción no los marque como completados de forma incorrecta.

## Flujo de recuperación

1. Durante la grabación, cada fragmento recibido se agrega al WebM parcial propio de esa sesión. Una interrupción no incorpora datos de una grabación previa.
2. Al iniciar la aplicación o volver a su ventana principal, detectar las sesiones no terminadas. Mostrar un aviso destacado con un botón, por ejemplo, **“Hay grabaciones por recuperar — Revisar”**.
   Si la aplicación inicia oculta en el área de notificación de Windows, incluir también una entrada visible de recuperación en el menú del icono.
3. El botón abre una ventana independiente que lista cada sesión con fecha, estado y acciones disponibles.
4. Para una captura interrumpida mientras grababa, intentar validar y recuperar el WebM parcial; indicar claramente si el archivo puede recuperarse o si quedó dañado.
5. Para una captura ya finalizada que se interrumpió durante guardado o transcripción, ofrecer continuar el guardado. Si había audio y la transcripción no terminó, volver a transcribir desde el comienzo usando el original conservado. No prometer reanudar Whisper en un punto interno.
6. Después del éxito, eliminar el original parcial y el manifiesto. Ofrecer **Descartar** para borrar expresamente una sesión pendiente.
7. Al iniciar otra grabación, crear siempre un archivo y manifiesto nuevos; nunca anexar la nueva captura a una sesión anterior.

## Interfaz y estados

- La ventana principal muestra el aviso solo cuando hay sesiones recuperables.
- La ventana de recuperación presenta estados legibles: captura interrumpida, lista para guardar, transcripción pendiente, guardado interrumpido y no recuperable.
- Cada acción muestra progreso y errores claros; las acciones que alteran archivos requieren que la fila identifique la grabación.
- Si una captura no puede recuperarse, mostrar el motivo disponible y permitir descartarla. No afirmar que se recuperó hasta validar su salida.
- La interfaz debe seguir el estilo actual, permitir uso con teclado y tener estados de carga, lista vacía y error.

## Límites de recuperación

- Un cierre abrupto puede dejar incompleto el último fragmento o las estructuras finales del contenedor WebM. Intentar recuperarlo mediante las herramientas multimedia ya incluidas y comunicar el resultado; no garantizar recuperación si los datos están dañados.
- Un cierre durante la transcripción obliga a repetir la transcripción desde el inicio, pero no pierde el original.
- Una sesión activa no puede seguir capturando mientras la aplicación está cerrada. La siguiente captura empieza cuando el usuario vuelve a iniciarla y queda en un archivo nuevo.
- El sistema no reanuda conversiones exactamente desde el punto de interrupción; rehace la etapa necesaria desde el original conservado.
- No eliminar automáticamente sesiones recuperables por antigüedad. El usuario decide cuándo descartarlas.
- La captura y la transcripción permanecen locales; no se envían archivos a servicios externos.

## Alcance técnico

- Mantener al proceso principal como propietario de rutas, manifiestos, validación, recuperación y limpieza. El renderer envía identificadores y acciones acotadas, nunca rutas de archivo arbitrarias.
- Usar identificadores UUID y operaciones seguras ante reintentos. No sobrescribir destinos existentes sin la confirmación y la lógica de nombres ya establecidas.
- Recuperar la compatibilidad con sesiones pendientes de versiones anteriores solo si puede demostrarse que los archivos existen y son seguros; en caso contrario, ignorarlas y conservarlas sin borrar.
- Integrar una ventana Electron independiente con contexto aislado y una API preload mínima para listar, continuar y descartar sesiones.
- Actualizar el README con ubicación, límites, reintento de transcripción y descarte.

## Criterios de aceptación

- Cada grabación nueva crea un WebM independiente en la subcarpeta `Recuperación` dentro de la carpeta de videos activa; el archivo de otra sesión nunca se reutiliza como destino de captura.
- Una sesión interrumpida antes de completarse aparece en el aviso y en la ventana de recuperación después de reiniciar la aplicación.
- Una sesión lista o interrumpida durante el guardado permite reintentar el flujo de guardado desde el original.
- Una sesión con audio interrumpida en transcripción permite repetir la transcripción y completar el par de video y SRT.
- Los originales y manifiestos solo se eliminan después de completar la salida o de que el usuario descarte la sesión.
- Los archivos parciales no se confunden con salidas terminadas, y destinos previos permanecen intactos ante errores.
- Un archivo corrupto se identifica como no recuperable y nunca se presenta como guardado correctamente.
- El comportamiento de recuperación se comprueba con pruebas de manifiestos, limpieza, validación de rutas, estados de guardado y el flujo IPC/UI.
