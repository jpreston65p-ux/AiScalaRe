# SCALA Facebook — comentarios públicos

Actualización 0.2, 11 de octubre de 2026.

**Estado real: una respuesta pública de prueba publicada y verificada en Facebook; el programa todavía no tiene una sesión conectada ni un servicio activo de Facebook en Railway.** El navegador de esta conversación y el navegador del programa son sesiones diferentes.

La cuenta comprobada es Scala Fe, perfil profesional ID 61576458508649. Se verificaron controles en un reel y en una publicación de foto anterior. La respuesta publicada fue una prueba mediante el navegador de esta conversación; no demuestra que el programa responda por sí solo.

## Cambios

- Se eliminó el recorrido limitado a 20 publicaciones. La detección utiliza los avisos de comentarios de Facebook, que pueden apuntar a publicaciones antiguas o nuevas.
- La pantalla de avisos se lee cada 3 segundos y se vuelve a cargar cada 30 segundos. Son intervalos de lectura: el tiempo total depende de Facebook, la conexión y la cola de respuestas.
- El primer comentario nuevo de una publicación antigua o recién creada ya no se descarta por crear una línea base para esa publicación.
- Los avisos agrupados se identifican por el comentario de destino, aunque reutilicen el mismo identificador de notificación. Las publicaciones con actividad reciente se revisan durante tres minutos para detectar otros comentarios del grupo.
- Los pendientes y la deduplicación sobreviven a reinicios. Los comentarios posteriores a la activación pueden recuperarse hasta 24 horas después si Facebook mantiene el aviso disponible.
- Se corrigieron las respuestas situadas junto al comentario, la fecha completa en español, la lectura de emojis y la identidad del campo «Comentar como Scala Fe».
- Se muestra el filtro «Más recientes», se abren respuestas existentes y se comprueba el autor y el comentario padre antes de publicar. Una respuesta temporal «Publicando» no cuenta como un envío confirmado.

**No representa una garantía de todos los comentarios ni de respuestas instantáneas.** Facebook puede omitir, agrupar, retrasar o dejar de mostrar avisos. Se atienden comentarios directos de visitantes en publicaciones propias con enlaces reconocidos; no comentarios en grupos, publicaciones ajenas o respuestas anidadas. La cuota configurada es de 100 respuestas diarias.

## Mensajes

Las respuestas identifican al asistente virtual de SCALA, usan párrafos breves y como máximo dos emojis. El catálogo confirmado incluye «Gedeón, el valiente obediente», cuento digital PDF basado en Jueces 6 y 7. No se inventan productos, promociones, edades, páginas ni pagos.

El producto puede identificarse por su mención en el comentario, una asociación configurada o el título del catálogo presente en el texto de la publicación. El texto de otros visitantes no configura el producto de una publicación. Si el producto no se puede identificar, se hace una sola pregunta para aclararlo.

El precio y la moneda, los medios de pago, el horario y la descarga siguen sin configurar. La respuesta del precio informa que debe confirmarse. Los pagos particulares, comprobantes y entregas se orientan a privado; no se afirma haber enviado mensajes, avisado al equipo o autorizado compras.

## Conectar el programa en Linux Mint

Se necesita Node.js 24. Descomprime el ZIP en Descargas:

```bash
cd "$(xdg-user-dir DOWNLOAD)/SCALA_FACEBOOK_BOT"
bash PREPARAR_SCALA_FACEBOOK.sh
bash CONECTAR_SCALA_FACEBOOK.sh
bash INICIAR_SCALA_FACEBOOK.sh
```

La preparación instala Playwright y su Chromium oficial. La conexión abre una ventana de Facebook: inicia sesión allí y selecciona Scala Fe. Pulsa Enter en la terminal para verificar la cuenta y los controles. No introduzcas contraseñas o códigos en el chat ni en la terminal.

El programa comprueba la sesión antes de habilitar envíos en la configuración local. La primera respuesta autónoma debe verificarse con un comentario nuevo; el programa exige observar un identificador numérico real, el autor SCALA y el mismo comentario padre antes de marcarla como enviada. Los envíos inciertos no se repiten automáticamente.

El ZIP mantiene `verifiedPage=false` y `allowSending=false`. Descargar el archivo no conecta Facebook. La sesión del programa se guarda en su carpeta privada; no se exporta la sesión de esta conversación. La interfaz calibrada está en español y el navegador del programa usa la zona America/La_Paz.

Para ver mensajes sin publicar:

```bash
bash PROBAR_COMENTARIOS.sh
```

La demo no conecta a Facebook. Las comprobaciones técnicas se ejecutan con `npm test`.

## Nube

**No hay un servicio de Facebook desplegado o autenticado en Railway. Esta actualización no funciona todavía con la PC apagada.** Ejecutar el programa en Linux Mint requiere que la PC y el proceso permanezcan encendidos.

Para la nube hace falta un servicio independiente, un navegador compatible, almacenamiento privado persistente y una sesión de Facebook autorizada en ese navegador. La sesión abierta en esta conversación no puede reutilizarse automáticamente como sesión del programa. WhatsApp permanece funcionando en su servicio separado y no se modificó.

El código admite una carpeta privada configurada mediante `SCALA_FACEBOOK_DATA_DIR` y ejecución sin ventana mediante `SCALA_FACEBOOK_HEADLESS=1`; eso prepara el código para un servidor y no prueba su funcionamiento allí. No se desactiva el aislamiento de Chromium.

El ZIP incluye solo código y datos públicos: excluye perfiles de navegador, sesiones, bases de datos, claves y dependencias instaladas.
