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
