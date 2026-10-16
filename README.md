# WinScreen Recorder

Aplicación de escritorio para grabar pantallas o ventanas en Windows.

## Requisitos

- Windows 10/11 x64.
- Node.js 20 o posterior para desarrollo.
- Conexión a Internet durante la primera preparación de FFmpeg y al instalar dependencias.

## Desarrollo

```powershell
npm install
npm start
```

Para ejecutar las comprobaciones locales antes de compilar:

```powershell
npm run check
npm test
```

## Crear el instalador de Windows

```powershell
npm run dist:win
```

El instalador x64 se genera en `dist/`. El proceso prepara una compilación Windows x64 de FFmpeg fijada a una versión y SHA-256, verifica sus componentes para WebM, MP4, MKV y GIF y la incluye fuera de ASAR. El paquete es grande porque incluye el conversor multimedia completo.

## Instalar y actualizar

1. Ejecuta el instalador y elige la ubicación de instalación.
2. Si WinScreen Recorder está abierto en la ubicación que se actualizará, acepta la solicitud de cierre. Desde la versión 1.3.0, la aplicación finaliza la captura y conserva los originales pendientes antes de cerrar. El instalador espera hasta 45 segundos y comprueba la ruta exacta del programa; no fuerza la terminación.
3. Si actualizas desde la versión 1.2.0 o una anterior, elige **Salir** desde el icono de la bandeja. Si hay una captura pendiente, selecciona **Conservar y salir**. Después pulsa **Reintentar** en el instalador. Esas versiones aún no pueden recibir la solicitud de cierre automático.
4. Si no puede confirmarse el cierre, reintenta o cancela. Al terminar, deja marcada la opción de ejecutar WinScreen Recorder para abrir la nueva versión.

La actualización conserva la configuración, los manifiestos de recuperación y las capturas. Una segunda ejecución normal activa la instancia existente. Una instalación silenciosa se cancela si no puede confirmar el cierre; no reemplaza archivos en uso. El generador NSIS compatible está fijado en la configuración de compilación.

## Atajos de teclado

Los atajos globales funcionan con la aplicación abierta, aunque esté oculta o estés usando otro programa. Iniciar utiliza la fuente y el tipo de captura seleccionados. Las acciones respetan los controles disponibles: no inician otra grabación mientras se guarda una captura y ningún atajo descarta archivos.

| Atajo | Acción | Alcance |
| --- | --- | --- |
| Ctrl + Shift + F8 | Pausar o reanudar la grabación | Global |
| Ctrl + Shift + F9 | Iniciar la captura seleccionada | Global |
| Ctrl + Shift + F10 | Detener grabación o cancelar cuenta atrás | Global |
| Ctrl + Shift + F11 | Mostrar la ventana principal | Global |
| Ctrl + Shift + M | Alternar vista compacta | Global |
| F1 | Consultar atajos de teclado | Ventana principal |
| Ctrl + S | Guardar o reintentar captura pendiente | Ventana principal |
| Ctrl + R | Actualizar pantallas y ventanas | Ventana principal |
| Ctrl + L | Llevar el foco al selector de fuentes | Ventana principal |
| Ctrl + Shift + A | Seleccionar una porción de pantalla | Ventana principal |
| Ctrl + Shift + 1 | Activar o desactivar micrófono | Ventana principal |
| Ctrl + Shift + 2 | Activar o desactivar audio de Windows | Ventana principal |
| Ctrl + , | Ir a Configuración | Ventana principal |
| Ctrl + Shift + R | Abrir grabaciones por recuperar | Ventana principal |
| Ctrl + I | Abrir información de la aplicación | Ventana principal |
| Esc | Cancelar cuenta atrás o cerrar ajustes y diálogos | Ventana principal |
| F5 | Actualizar lista de recuperaciones | Recuperación |
| Esc / Ctrl + W | Cerrar la ventana independiente | Información y recuperación |

Consulta **Atajos de teclado** dentro de **Acerca de la aplicación**, al pie de la app, o pulsa **F1** para abrir esa sección directamente. La ayuda muestra la disponibilidad real de cada atajo. Si otro programa ocupa uno global, se indica como disponible solo en la ventana principal; vuelve a abrir la aplicación después de liberarlo para intentar registrarlo otra vez. Los atajos locales respetan los campos de texto y la composición de escritura. Usa Tab y Shift + Tab para recorrer controles, Enter o espacio para activarlos, y flechas, Inicio y Fin para recorrer las tarjetas de fuentes antes de seleccionarlas con Enter.

## Captura y formatos

- **Biblioteca:** abre las últimas 100 capturas desde la ventana principal o compacta. Permite buscar, reproducir, abrir la carpeta y agregar archivos anteriores. Quitar una entrada del historial conserva el archivo y sus subtítulos.
- Muestra formato, tamaño y duración disponible. Permite ordenar por fecha, nombre, tamaño o duración y guardar nombres descriptivos. Estos nombres pertenecen a la biblioteca; los archivos conservan su nombre y ubicación.
- **Recortes:** desde Biblioteca, indica inicio y final en segundos o usa la posición del reproductor. Se crea otra copia MP4 junto al original, con subtítulos ajustados cuando existen. Los archivos originales se conservan y los nombres repetidos reciben un número.
- Los deslizadores permiten elegir el intervalo y **Reproducir fragmento** comprueba el inicio y el final antes de guardar.
- **Cancelar proceso:** está disponible durante el guardado en las vistas normal y compacta, durante la recuperación y durante los recortes. Detiene la conversión o descarga y conserva el original para reintentar. Si el video ya se publicó y solo faltan los subtítulos, ese video permanece guardado.
- **Suspensión y fallos:** mientras captura, solicita a Windows impedir la suspensión automática. Ante una suspensión manual solicita finalizar la grabación; si Windows interrumpe antes de terminar, los fragmentos permanecen en Recuperación. Sincroniza los datos cada 15 segundos y espera el cierre del archivo al finalizar. Si falla la interfaz durante una captura, conserva los fragmentos y vuelve a cargar la ventana.
- **Aceleración automática:** al exportar MP4 o MKV y al recortar, prueba los codificadores Intel, NVIDIA y AMD incluidos. Usa hardware solo tras una prueba satisfactoria y conserva la selección durante esa ejecución. Un fallo del codificador permite reintentar por software; los errores de disco o de entrada no provocan otra conversión completa. GIF mantiene su conversión habitual.
- **Atajos personalizados:** en Biblioteca puedes cambiar los cinco atajos globales o restaurar los predeterminados. La configuración se conserva. Si una combinación está ocupada, se mantienen los atajos anteriores.
- **Límite de duración:** admite de 0 a 1440 minutos enteros, en ambas vistas. Cero desactiva el límite. Al alcanzarlo, finaliza y guarda la grabación; el tiempo en pausa no cuenta.
- **Pérdida de señal:** una pista temporalmente silenciada muestra un aviso y permite continuar. Si la pantalla, ventana o entrada de audio se desconecta, finaliza y guarda lo capturado. El aviso permanece visible hasta iniciar otra captura.
- **Calidad:** Ligero usa hasta 720p, 15 FPS y 2 Mbps; Equilibrado, hasta 1080p, 30 FPS y 6 Mbps; Alta calidad, tamaño original, hasta 60 FPS y 16 Mbps. Al cambiar resolución o FPS se muestra Personalizado. Son valores solicitados: el resultado depende de la fuente y del equipo. Los ajustes se conservan entre ejecuciones y cada recuperación mantiene la calidad con que se grabó.
- **Micrófono:** activa el micrófono y selecciona una fuente para elegir una entrada y probar su nivel antes de grabar. El volumen admite 0–200 %; por encima del 100 % puede distorsionar. La prueba no reproduce ni guarda tu voz. Finaliza con el mismo botón y se libera al iniciar una captura, cambiar dispositivo, desactivar el micrófono u ocultar la ventana. Estos controles también están en Ajustes de la vista compacta.
- Durante la captura, ambas vistas muestran medidores separados de micrófono y audio de Windows. Tras 10 segundos de señal inferior al 0.5 % aparece un aviso; los picos sostenidos durante 700 ms cerca del máximo advierten de posible distorsión. Las pausas reinician la espera y no se interpretan como silencio. Estos avisos no detienen la captura.
- **Espacio:** se muestra la capacidad libre del volumen de recuperación. Por debajo de 1 GiB aparece un aviso; al bajar de 256 MiB durante la grabación se solicita su finalización. Con espacio crítico no se inicia otra grabación ni se exporta al destino afectado. El original recuperable se conserva. Una consulta fallida se indica como espacio desconocido. El espacio libre no garantiza una duración concreta ni que quepa cualquier conversión.
- **Progreso:** la descarga del modelo muestra porcentaje cuando el servidor informa el tamaño y alcanza 100 % después de comprobar su integridad. La conversión usa el avance real de FFmpeg y la duración grabada sin pausas. Las recuperaciones antiguas o interrumpidas sin duración muestran segundos procesados y una barra indeterminada. La transcripción informa su etapa, sin un porcentaje estimado.
- Durante una grabación, **Pausar** y **Reanudar** están disponibles en las vistas normal y compacta, y mediante **Ctrl + Shift + F8** aunque la ventana esté oculta. El video y el audio se pausan juntos; el contador excluye las pausas. **Detener** permite finalizar y guardar desde la pausa. La bandeja identifica la pausa manual. Si aún se están escribiendo datos, reanudar espera a que la cola se vacíe lo suficiente. Una nueva grabación comienza sin pausas anteriores.
- El selector permite capturar video o imagen. Las imágenes se guardan como PNG o JPG; conservan la selección de pantalla/ventana, el tamaño de salida y la cuenta atrás. El audio y la transcripción se usan solo para video.
- Para capturar solo una parte, elige una pantalla y activa “Capturar una porción”. Arrastra sobre la vista previa para seleccionar el área; el recuadro se marca también sobre la tarjeta de la pantalla.
- De manera predeterminada, las capturas se guardan en `Videos\WinScreenRecorder`; la carpeta se crea al iniciar. Se puede cambiar desde Configuración. Si el nombre ya existe, se genera otro con sufijo.
- WebM se guarda directamente desde la captura.
- MP4 y MKV se convierten a H.264/AAC; GIF se genera como animación sin audio.
- Micrófono y audio de salida de Windows se pueden combinar con el video. El audio del sistema depende del soporte de loopback disponible en Windows.
- Si falla una conversión, la captura WebM original se conserva para que pueda guardarse.
- Las capturas pendientes se escriben en `Videos\\WinScreenRecorder\\Recuperación`; si cambiaste la carpeta de guardado, se usa la subcarpeta `Recuperación` dentro de esa ubicación. Al volver a abrir la aplicación, un aviso destacado permite abrir una ventana con las capturas interrumpidas para continuar el guardado o descartarlas.
- Si una captura se interrumpe mientras se graba, el siguiente inicio crea otro archivo independiente. La recuperación del último WebM es de mejor esfuerzo y depende de que sus fragmentos puedan leerse. Si la aplicación se cierra durante la transcripción, se vuelve a transcribir desde el inicio usando el original conservado.
- Los originales de recuperación permanecen en esa carpeta hasta que el video y sus subtítulos se guardan correctamente o se descartan desde la ventana de recuperación. Al elegir “Conservar y salir”, la aplicación finaliza la captura actual antes de cerrar.
- Al pasar el cursor sobre el icono del área de notificación, se muestra el estado actual y la cantidad de grabaciones por recuperar. Su menú también muestra si la aplicación está lista, grabando, en pausa por escritura, transcribiendo, convirtiendo o guardando, incluso con las ventanas ocultas.
- La opción **Acerca de la aplicación**, al pie de la ventana principal, abre una ventana independiente con la versión, el autor, las funciones, los formatos, las instrucciones de captura, la transcripción, la recuperación, los atajos de teclado y los requisitos de uso.
- El video se guarda antes de generar los subtítulos `.srt`. Si la transcripción falla, el video queda disponible y la aplicación avisa que los subtítulos están pendientes. Desde **Grabaciones por recuperar**, pulsa **Reintentar subtítulos** para generar solo el SRT junto al video, incluso después de reiniciar. Si ya existe un SRT, se agrega un número para conservarlo. Si el video se movió o eliminó, se conserva el original y se permite volver a exportarlo.
- También se transcribe la captura si se guarda como WebM original o GIF; el SRT es independiente y puede reutilizarse con otros reproductores o editores. Las capturas sin audio se guardan sin SRT. Descartar una sesión pendiente elimina su original de recuperación; el video ya guardado permanece intacto.
- Cuando la pista de audio no contiene voz, el proceso se completa y el SRT puede quedar vacío.
- La transcripción usa `whisper.cpp` localmente. El modelo multilingüe base cuantizado (aprox. 57 MiB) se descarga y valida la primera vez que se guarda una captura con audio; después queda disponible sin conexión. El audio nunca se envía a un servicio. Si la descarga o transcripción falla, el video permanece guardado y el original de recuperación se conserva para reintentar los subtítulos.
- El runtime de whisper.cpp se prepara automáticamente en desarrollo y se incluye con el instalador. El modelo se mantiene fuera del instalador para reducir su tamaño.
- La descarga del modelo usa HTTPS, espera máxima por solicitud, límite de 100 MiB y verificación SHA-256 antes de instalarlo.
- Si la escritura de fragmentos se retrasa, la grabación se pausa temporalmente y se reanuda al vaciarse la cola; el contador excluye ese tiempo.

La compilación de FFmpeg incluida tiene licencia LGPLv3 o posterior y su configuración verificada no habilita componentes GPL o no libres. Usa OpenH264 para H.264 en lugar de libx264; la velocidad y calidad dependen del equipo y de la captura.

## Licencias

Los avisos y textos de licencia de FFmpeg, OpenH264, GCC y whisper.cpp están en `LICENSES/`; el instalador los incluye en `resources/licenses` junto a los ejecutables nativos. El runtime whisper.cpp se obtiene de su distribución oficial de Windows x64 y se verifica por SHA-256 durante la preparación.

El instalador no está firmado digitalmente. La firma requiere un certificado y configuración de publicación propios.
