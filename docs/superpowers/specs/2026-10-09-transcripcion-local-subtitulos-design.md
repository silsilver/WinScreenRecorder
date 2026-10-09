# Transcripción local obligatoria al guardar

Fecha: 2026-10-09
Proyecto: WinScreen Recorder
Estado: Propuesta aprobada para revisión de especificación

## Objetivo

Al guardar una captura que contiene audio, generar automáticamente una transcripción local sincronizada y guardar sus subtítulos junto al medio. La aplicación no preguntará si se quiere transcribir y no enviará el audio a servicios externos.

## Flujo propuesto

1. La captura termina y queda pendiente, como ahora, en un archivo temporal WebM.
2. El usuario elige el destino y formato del video.
3. Si la captura contiene audio, la aplicación convierte el audio a PCM temporal y ejecuta reconocimiento local con `whisper.cpp`; el modelo multilingüe detecta el idioma automáticamente.
4. Se crea un archivo de subtítulos SubRip (`.srt`) con el mismo nombre base y en la misma carpeta que el video elegido. El SRT permanece independiente del contenedor para poder reutilizarlo o editarlo después.
5. El video y el SRT se escriben primero como archivos parciales. Solo se consideran guardados cuando ambos están completos. Ante un error, se conservan la captura WebM y los archivos destino preexistentes; la aplicación informa el fallo y permite reintentar.
6. La selección GIF también produce su archivo SRT cuando la captura original tiene audio. Aunque GIF no puede reproducir sonido/subtítulos, el SRT conserva la transcripción sincronizada con esa captura.
7. Si la captura no contiene audio, se guarda el video sin transcripción porque no hay contenido que transcribir.

## Modelo y privacidad

- El reconocimiento se ejecuta en el equipo usando `whisper.cpp` Windows x64, versión fijada `b5454`.
- El modelo multilingüe base q5_1 se descarga una sola vez desde la revisión fijada `f281eb45af861ab5e5297d23694b7d46e090c02c` del repositorio oficial de modelos whisper.cpp; tamaño 59,707,625 bytes y SHA-256 `422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898`.
- El modelo se almacena en datos de usuario de la aplicación y se reutiliza en sesiones posteriores.
- La descarga se realiza como parte del guardado, sin confirmación adicional. La interfaz muestra descarga/progreso y transcripción.
- Si no hay conexión para obtener el modelo, el guardado no se da por completado; la captura queda disponible para reintentar cuando el modelo pueda descargarse.
- No se sube audio. La aplicación no registra ni persiste el texto transcrito en telemetría.

## Interfaz y estados

- El control de guardar pasa a un estado ocupado durante preparación del modelo, transcripción y creación de archivos.
- El texto de estado describe el paso actual y los errores accionables.
- Cualquier acción de guardado, incluido guardar el original WebM tras una conversión fallida, ejecuta la transcripción si hay audio. El guardado tiene éxito solo cuando video y SRT están completos.
- Si falla, la captura original sigue disponible mediante las acciones ya existentes para reintentar o guardar WebM.

## Alcance técnico

- Integrar runtime nativo y modelo sin ejecutar comandos proporcionados por el usuario ni usar shell.
- Fijar versiones y verificar SHA-256 de las descargas del runtime/modelo; incluir avisos de licencia del programa y del modelo.
- Mantener el modelo fuera del instalador para limitar su tamaño; descargarlo de forma atómica y validar antes de marcarlo listo.
- Añadir IPC acotado y validado desde el renderer confiable. El proceso principal controla rutas temporales y destinos; nunca acepta rutas arbitrarias del renderer para archivos de sistema.
- Usar temporales únicos, limpieza en éxito/cancelación/error y evitar sobreescribir un SRT preexistente sin una ruta de guardado coherente. El video/SRT existentes no se dañan si la transcripción o conversión falla.
- Si el destino elegido no existe pero su SRT ya existe, elegir automáticamente el siguiente nombre libre para el par video/SRT. Si el archivo de video ya existe y el diálogo de guardar confirmó su reemplazo, reemplazar su SRT pareado dentro de la misma operación reversible.
- Actualizar README con el primer uso, tamaño aproximado si se determina, uso sin conexión después de descargar el modelo, formatos SRT y manejo de errores.

## Fuera de alcance

- Editor de subtítulos integrado.
- Exportar texto plano o VTT en esta primera versión.
- Insertar subtítulos dentro de MP4/MKV; se conserva un SRT independiente reutilizable.
- Traducción, diarización o separación de hablantes.
- Procesamiento en nube.

## Criterios de aceptación

- Cualquier opción de guardado para una captura con audio genera video y SRT con el mismo nombre base en la carpeta seleccionada sin preguntar si se transcribe.
- El contenido del SRT incluye secuencia, marcas temporales válidas y texto transcrito; se sincroniza con la línea de tiempo de la captura.
- Si la pista no contiene voz, se puede guardar un SRT vacío después de completar el reconocimiento sin bloquear el guardado.
- Micrófono y audio de sistema mezclados en la grabación se incluyen en la transcripción.
- El modelo se obtiene una vez y luego funciona sin conexión a Internet.
- Si se cancela el selector de destino no se produce una transcripción ni se pierde la captura pendiente.
- Si la descarga, el reconocimiento, la conversión o la escritura de artefactos falla, el usuario recibe un error claro y la fuente original permanece disponible para reintento; ningún destino ya existente queda truncado.
- Grabaciones sin audio se guardan sin SRT.
- El instalador incluye el runtime y sus licencias necesarias, pero no el modelo descargable.

