# Fiabilidad, audio y edición

El usuario autoriza aplicar las seis mejoras propuestas, decidir el orden y
corregir mejoras adicionales sin preguntas. Cada etapa requiere una comprobación
en la aplicación antes de continuar.

Se mantiene Electron y JavaScript, sin dependencias nuevas. La alternativa de
añadir un editor multimedia completo aumentaría el consumo y la complejidad;
se elige ampliar los controles actuales. La aceleración solo se utilizará tras
una prueba real del codificador y siempre tendrá alternativa por software.

1. Fiabilidad: impedir suspensión automática mientras se captura, solicitar
   finalización ante suspensión manual, sincronizar periódicamente los datos y
   comprobar una captura prolongada y recuperación después de interrupción.
2. Cancelación: botones para detener guardado y recorte. Propagar cancelación a
   FFmpeg y descarga, esperar limpieza y conservar originales y videos publicados.
3. Audio: medidores durante captura, silencio sostenido y saturación, separados
   del aviso de desconexión. No interpretar una pausa manual como silencio.
4. Recorte: controles de intervalo accesibles y reproducción limitada al fragmento.
5. Biblioteca: tamaño, duración, formato, orden y nombres descriptivos del historial.
   Renombrar la entrada no cambia rutas ni borra archivos.
6. Eficiencia: sondeo de NVENC/QSV/AMF disponibles en FFmpeg mediante un video de
   prueba, resultado conservado durante la ejecución, alternativa OpenH264 si falla.

Se verificará cada etapa en Electron con perfil y medios aislados. Los eventos de
suspensión se simularán; no se suspenderá el equipo del usuario. Las pruebas de
audio usarán señal controlada y se distinguirán de dispositivos físicos. La
prueba prolongada medirá minutos reales, sin afirmar una validación de varias horas.
