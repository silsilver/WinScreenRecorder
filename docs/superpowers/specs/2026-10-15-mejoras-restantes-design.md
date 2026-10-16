# Mejoras restantes autorizadas

La petición «aplica el resto de mejoras» autoriza progreso, espacio, calidad y audio.

- Progreso: descarga con bytes y porcentaje si Content-Length es válido; 100 %
  solo después de validar el modelo. Conversión con -progress de FFmpeg y duración
  real sin pausas guardada en recuperación. Sin duración, mostrar segundos
  procesados y una barra indeterminada; no inventar porcentajes.
- Espacio: consultar el volumen real de recuperación antes de iniciar y cada
  cinco segundos durante captura; aviso por debajo de 1 GiB, finalización al bajar
  de 256 MiB. Conservar original. Antes de exportar comprobar el destino. Consulta
  fallida se comunica como desconocida, sin prometer capacidad suficiente.
- Calidad: Ligero 720p/15 FPS/2 Mbps; Equilibrado 1080p/30 FPS/6 Mbps;
  Alta calidad original/60 FPS/16 Mbps. Cambiar resolución o FPS marca
  Personalizado. Persistir calidad y duración por sesión para recuperación;
  conservar compatibilidad con registros anteriores.
- Audio: seleccionar entrada, ganancia 0-200 %, medidor y prueba previa explícita,
  sin reproducción por altavoces. La prueba requiere activar micrófono y seleccionar
  una fuente (se conserva la política de permisos existente). Liberar prueba al
  iniciar, desactivar micrófono, cambiar dispositivo o cerrar. No sustituir una
  entrada elegida que desapareció por otra sin aviso.

Se amplían los controles existentes y se usan módulos pequeños para política,
progreso y audio. No se añaden dependencias ni actualizaciones automáticas.
Se conservan los cambios anteriores. Validar con pruebas unitarias, procesos
FFmpeg reales y audio/video sintéticos en Electron; los dispositivos físicos y
atajos desde otras aplicaciones siguen requiriendo comprobación manual.
