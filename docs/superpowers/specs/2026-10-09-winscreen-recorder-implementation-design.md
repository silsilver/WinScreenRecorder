# WinScreen Recorder: diseño de implementación

## Objetivo

Completar el flujo de grabación y preparar una distribución de Windows que cumpla las opciones que muestra la aplicación, comunique los errores con claridad y libere correctamente los recursos de captura.

## Decisiones

- Capturar audio y video con las API de Chromium/Electron y guardar la captura inicial en WebM.
- Mantener MP4, MKV y GIF solo cuando la conversión de FFmpeg termine correctamente. Ejecutar FFmpeg como proceso secundario, empaquetar una compilación Windows x64 de BtbN fijada por release y SHA-256 y mostrar sus errores al usuario. La configuración verificada no habilita componentes GPL/no libres y utiliza OpenH264. Incluir los avisos de FFmpeg, OpenH264 y GCC. Si la conversión no está disponible, no presentar el archivo WebM como si fuera el formato elegido.
- Mantener WebM como salida directa. Guardar de forma asíncrona y transmitir los datos al proceso principal a través de una interfaz IPC limitada.
- Capturar el micrófono mediante la API de medios del renderer. Investigar y validar la captura de audio del sistema en Windows; solicitarla con un flujo que no muestre un selector de pantalla duplicado. Informar claramente cuando el dispositivo, la plataforma o la API no permitan audio.
- Modelar estados explícitos de cuenta regresiva, grabación, guardado, conversión, finalización y error. Cancelar cuenta regresiva, detener pistas y temporizadores en todos los finales y fallos, y no permitir operaciones simultáneas incompatibles.
- Validar el remitente y los argumentos de IPC, habilitar el sandbox de Electron cuando sea compatible, retirar bibliotecas de ejecución desde CDN e incluir dependencias de interfaz en el paquete local con una política CSP.
- Añadir configuración de empaquetado Windows, scripts claros de desarrollo y distribución, bloqueo de dependencias y exclusiones de artefactos generados.

## Flujo

1. El usuario selecciona una pantalla o ventana y las fuentes de audio disponibles.
2. La aplicación valida la selección y ejecuta la cuenta regresiva opcional.
3. El renderer obtiene las pistas permitidas y las graba como WebM.
4. Al detenerse o terminar una pista, finaliza MediaRecorder y presenta el diálogo para guardar.
5. WebM se escribe directamente. Para MP4, MKV o GIF, un proceso FFmpeg empaquetado convierte la captura a un archivo temporal y lo publica en el destino solo tras éxito; los fallos conservan la captura original y permiten recuperarla.
6. La interfaz informa el resultado y libera todas las pistas, temporizadores y procesos.

## Errores y límites

- La cancelación del diálogo no se considera éxito ni elimina la captura recuperable.
- Un cierre, una pista terminada por el sistema o un fallo de conversión debe actualizar el estado y cerrar recursos sin dejar procesos huérfanos.
- El audio del sistema usa `setDisplayMediaRequestHandler` con `audio: 'loopback'` solo en Windows, y queda condicionado a que Electron/Windows entregue una pista. No se indicará que se grabó si la pista no existe. Micrófono y loopback se mezclan en una pista cuando ambos se habilitan.
- No se promete firma de código ni publicación automática. La primera entrega debe producir un paquete instalable local reproducible; la firma requiere certificado y configuración propios del usuario.

## Verificación

- Revisar el flujo con una fuente de pantalla y una ventana, cancelación de guardado, grabación breve, errores de permisos y terminación inesperada de pistas.
- Confirmar los contenedores y códecs resultantes de WebM, MP4 y MKV; abrir el GIF resultante y comprobar ausencia de audio esperada.
- Comprobar que el binario FFmpeg y sus avisos coinciden con las sumas SHA-256 fijadas y que la compilación contiene filtros, muxers y encoders requeridos.
- Crear el paquete de Windows y validar que arranque en un entorno sin FFmpeg instalado por separado.
- Inspeccionar la configuración de seguridad, la carga local de recursos y los argumentos aceptados por IPC.

## Fuera de alcance

- Pausar y reanudar, salvo que la API elegida lo soporte de forma fiable y el esfuerzo no comprometa el flujo de guardado.
- Firma digital, actualización automática, publicación en una tienda y funciones de edición de video.
