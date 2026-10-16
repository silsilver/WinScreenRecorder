# Pausa manual

La petición «aplica» autoriza la siguiente mejora propuesta: pausa manual con botón
y atajo global. Se integra en la grabación existente sin crear nuevos videos.

Botones Pausar/Reanudar en vista normal y compacta; Ctrl + Shift + F8 como atajo
global, con el mismo aviso de disponibilidad y alternativa local de los demás
atajos. Solo actúa durante una grabación. Detener sigue disponible en pausa.

La pausa manual y la pausa por escritura son causas independientes: el grabador
solo reanuda cuando ambas desaparecen. La cola mantiene los umbrales de 24 MiB
para pausar y 8 MiB para reanudar. El contador descuenta la unión de ambos
intervalos, sin contabilizar dos veces pausas superpuestas. La bandeja distingue
pausa manual de escritura. Detener nunca reanuda por vaciar la cola.

Se prefiere mantener la fase recording y gestionar causas de pausa en un
controlador independiente a duplicar todos los estados y guardas existentes.
No se incluyen porcentajes de progreso, perfiles ni controles nuevos de audio.

Validación: reloj controlado, pausas superpuestas en ambos órdenes, umbrales,
detención pausada, contador y atajo; sintaxis, suite completa y empaquetado.
