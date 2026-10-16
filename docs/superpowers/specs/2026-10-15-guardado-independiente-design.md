# Guardado independiente de subtítulos

Diseño autorizado con «procede» sobre la mejora prioritaria propuesta.

El video se convierte y publica antes de intentar la transcripción. Si esta falla,
la interfaz confirma la ruta del video y avisa que los subtítulos siguen pendientes.
El original y la ruta de salida permanecen en el registro de recuperación.
Continuar una sesión con video guardado genera solamente el SRT, sin reconvertir ni
reemplazar el video. Si ya existe un SRT se usa un nombre disponible, sin sobrescribirlo.
Descartar elimina solamente el original de recuperación, nunca el video publicado.

Se prefiere este flujo a bloquear todo el guardado o exigir una segunda acción
manual para exportar sin subtítulos: el video queda disponible aun sin modelo local.
No se incluyen pausa manual, perfiles de calidad ni porcentajes de progreso.

Validación: fallos de transcripción y conversión, persistencia tras reinicio,
reintento de SRT sin modificar el video, colisiones y regresiones existentes.
