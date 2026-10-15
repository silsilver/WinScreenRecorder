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

**Atajos de teclado**, al pie de la app, y **F1** abren la ayuda con la disponibilidad real de cada atajo. Si otro programa ocupa uno global, se indica como disponible solo en la ventana principal; vuelve a abrir la aplicación después de liberarlo para intentar registrarlo otra vez. Los atajos locales respetan los campos de texto y la composición de escritura. Usa Tab y Shift + Tab para recorrer controles, Enter o espacio para activarlos, y flechas, Inicio y Fin para recorrer las tarjetas de fuentes antes de seleccionarlas con Enter.

## Captura y formatos

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
- La opción **Acerca de la aplicación**, al pie de la ventana principal, abre una ventana independiente con la versión, el autor, las funciones, los formatos, las instrucciones de captura, la transcripción, la recuperación y los requisitos de uso.
- Cada guardado con audio genera automáticamente un archivo de subtítulos `.srt` junto al video. También se transcribe la captura si se guarda como WebM original o GIF; el SRT es independiente y puede reutilizarse con otros reproductores o editores. Las capturas sin audio se guardan sin SRT.
- Cuando la pista de audio no contiene voz, el proceso se completa y el SRT puede quedar vacío.
- La transcripción usa `whisper.cpp` localmente. El modelo multilingüe base cuantizado (aprox. 57 MiB) se descarga y valida la primera vez que se guarda una captura con audio; después queda disponible sin conexión. El audio nunca se envía a un servicio. Si la descarga o transcripción falla, el guardado no se completa y la captura se conserva para reintentar.
- El runtime de whisper.cpp se prepara automáticamente en desarrollo y se incluye con el instalador. El modelo se mantiene fuera del instalador para reducir su tamaño.
- La descarga del modelo usa HTTPS, espera máxima por solicitud, límite de 100 MiB y verificación SHA-256 antes de instalarlo.
- Si la escritura de fragmentos se retrasa, la grabación se pausa temporalmente y se reanuda al vaciarse la cola; el contador excluye ese tiempo.

La compilación de FFmpeg incluida tiene licencia LGPLv3 o posterior y su configuración verificada no habilita componentes GPL o no libres. Usa OpenH264 para H.264 en lugar de libx264; la velocidad y calidad dependen del equipo y de la captura.

## Licencias

Los avisos y textos de licencia de FFmpeg, OpenH264, GCC y whisper.cpp están en `LICENSES/`; el instalador los incluye en `resources/licenses` junto a los ejecutables nativos. El runtime whisper.cpp se obtiene de su distribución oficial de Windows x64 y se verifica por SHA-256 durante la preparación.

El instalador no está firmado digitalmente. La firma requiere un certificado y configuración de publicación propios.
