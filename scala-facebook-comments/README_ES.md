# SCALA Facebook — comentarios desde la nube

Actualización 0.3, 11 de octubre de 2026, hora de Bolivia.

**Estado: el servicio independiente de Facebook y su volumen privado están creados en Railway. Firefox pasó una prueba real de aislamiento de contenido. Falta vincular la sesión propia del programa y observar una respuesta autónoma.** La respuesta de prueba publicada mediante el navegador de esta conversación permanece visible; no fue enviada por este programa.

Cuenta autorizada: **Scala Fe, perfil profesional ID 61576458508649**. No se cambió de cuenta ni se creó una Página distinta. WhatsApp funciona en su servicio independiente y esta actualización no lo modifica.

## Conectar desde Linux Mint

Descarga `INSTALAR_SCALA_FACEBOOK_NUBE.sh` en Descargas y ejecuta:

```bash
bash "$(xdg-user-dir DOWNLOAD)/INSTALAR_SCALA_FACEBOOK_NUBE.sh"
```

El instalador crea `SCALA_FACEBOOK_NUBE` en tu carpeta de Descargas, descarga el código público de la rama `scala-facebook-comentarios-cloud` de AiScalaRe e instala dependencias oficiales. Usa Node.js 24; puede reutilizar el instalado para SCALA WhatsApp. No sobrescribe tu catálogo ni configuración si ya existen en esa carpeta.

1. En la ventana propia de Firefox, inicia sesión en Facebook y selecciona **Scala Fe**.
2. Abre su perfil (`https://www.facebook.com/profile.php?id=61576458508649`) y pulsa Enter en la terminal cuando se vea la cuenta correcta.
3. Si falta acceso a Railway en esa PC, completa el formulario de Railway que abre su herramienta oficial.

El programa verifica cuenta, publicación propia y avisos antes de enviar su sesión al servicio `scala-facebook-comentarios`. El servidor vuelve a verificar identidad y controles antes de publicar. Si Facebook solicita otra verificación o cambia su interfaz, los envíos se detienen y debe revisarse la conexión.

La conexión de escritorio no navega a `/me/`. Conserva la pestaña del perfil mientras revisa publicaciones y avisos en pestañas propias. Si falla una comprobación, la ventana sigue abierta y puedes corregir la pantalla y pulsar Enter para reintentar. Se conserva el lector de la publicación: un fallo del menú no obliga a recargar una página ya verificada. `SALIR` o Ctrl+C cancelan. Una ventana cerrada puede reabrirse en el siguiente intento, conservando su perfil privado.

El filtro de comentarios se reconoce por controles visibles. Se prefiere «Más recientes», o «Todos los comentarios» cuando esa es la opción disponible, sin exigir que el menú se llame «Orden de comentarios». Se comprueba el cambio del control antes de continuar. Los diálogos de la publicación y los textos de visitantes se excluyen de las opciones, y un clic ambiguo se detiene. Si no se reconoce el menú, se indica cómo seleccionarlo manualmente y reintentar.

El programa utiliza el Firefox que instala Playwright, independiente del Firefox de Linux Mint. Puede mostrarse como Nightly; reinstalar el Firefox del sistema no sustituye el navegador privado del programa. Referencia: https://playwright.dev/docs/browsers#firefox.

Los registros `SCALA_ETAPA_FALLIDA`, `SCALA_ERROR_CONEXION` y `SCALA_PANTALLA` se guardan también en `data/comments/diagnostico-conexion.txt` (o en el directorio privado configurado). Solo contienen categorías y códigos, nunca direcciones visitadas, datos del cliente ni credenciales. `SCALA_CONEXION_COMPLETADA` indica que la sesión se envió y la configuración se guardó; después se cierra el navegador de conexión de forma anunciada. Aún falta la verificación del servidor.

**No escribas contraseñas, códigos ni sesiones en el chat.** Solo se obtiene la sesión del navegador propio de este programa; nunca se lee ni se exporta el navegador de ChatGPT. Se envía por la entrada privada de la herramienta oficial de Railway, al proyecto, entorno y servicio específicos. No se incluye en enlaces, argumentos de comandos, archivos públicos ni consola.

Después del registro `SCALA_CLOUD_WATCHING`, un visitante debe dejar un comentario nuevo para comprobar la respuesta. Solo `SCALA_CLOUD_REPLY_CONFIRMED` demuestra una respuesta autónoma observada. Enviar la sesión o alcanzar `SUCCESS` no demuestran por sí solos que el bot responda.

**Cuando la conexión y la respuesta autónoma estén verificadas, puedes cerrar la terminal y apagar la PC.** Railway debe permanecer activo y la sesión de Facebook debe seguir válida.

Para reconectar una carpeta preparada:

```bash
cd "$(xdg-user-dir DOWNLOAD)/SCALA_FACEBOOK_NUBE"
bash CONECTAR_SCALA_FACEBOOK.sh --nube
```

`ACTUALIZAR_SCALA_FACEBOOK.sh` descarga y comprueba el conjunto completo de módulos fuente antes de copiarlos. Conserva sesiones, base, dependencias, catálogo y configuración. Se puede indicar una revisión completa de GitHub como argumento para actualizar a una versión concreta.

## Publicaciones antiguas y nuevas

- Los avisos globales pueden señalar fotos antiguas o reels nuevos. Se eliminó el recorrido limitado a 20 publicaciones.
- Lectura cada **3 segundos** y recarga cada **5 segundos**. Son intervalos del programa, no una promesa de tiempo total.
- El primer comentario nuevo de una publicación recién detectada ya no se descarta al crear una línea base.
- Los avisos agrupados se identifican por el comentario de destino, aunque mantengan el mismo ID de notificación. Se revisan posts activos durante tres minutos para buscar otros comentarios nuevos.
- Pendientes y deduplicación sobreviven a reinicios. Se recuperan comentarios posteriores a la activación hasta 24 horas después, si Facebook conserva el aviso.
- Antes de enviar se verifican dueño, autor, comentario padre, fecha en español, zona America/La_Paz y controles visibles. Se conservan los borradores humanos.
- Solo se confirma el envío al observar una respuesta propia persistida, con ID numérico real y texto coincidente bajo el mismo comentario. Un envío incierto no se repite.

**No se garantiza respuesta instantánea ni cobertura de todos los comentarios:** Facebook puede retrasar, agrupar u omitir avisos. Se atienden comentarios directos de texto en posts propios con enlaces y controles reconocidos. Se omiten comentarios del dueño, respuestas anidadas, hilos ya atendidos, imágenes sin texto, enlaces aislados y grupos o posts ajenos. La cuota configurada es de 100 respuestas diarias.

## Mensajes

La respuesta pública identifica al asistente virtual y dirige al WhatsApp de SCALA, sin añadir precios, catálogo o promesas de compra:

> ¡Hola! 😊 Soy el asistente virtual de SCALA.
>
> Si quieres saber más sobre el producto, escríbenos por WhatsApp 💙.


El contacto de fábrica está sin configurar: el mensaje no incluye números ni enlaces inferidos. Se puede añadir un contacto expresamente autorizado con `whatsapp.number` y `whatsapp.url` en el catálogo. Se valida el dominio `wa.me` y la coincidencia de ambos números. Los comentarios del visitante nunca cambian este contacto. `BAJA` conserva la opción de pausar las respuestas de ese autor.

Producto: **Gedeón, el valiente obediente**, cuento digital PDF basado en Jueces 6 y 7 para conversar sobre valentía, fe y obediencia. Precio y moneda, pagos, horario y descarga siguen sin configurar. No se inventan descuentos, edades, páginas ni materiales.

Las preguntas de compra se atienden por WhatsApp; los comentarios públicos no confirman pagos ni envíos y no muestran datos privados. El servicio existente de WhatsApp no se modifica en esta actualización.

## Railway

- Proyecto: `86dc9c33-9042-48a9-8201-b94e04232179`.
- Producción: `7da2eda3-0a63-4bb2-9b2f-d606f18a3987`.
- Servicio Facebook: `1ff3639b-084e-48d6-a8fa-be50be6c3075`.
- Volumen privado `sesion-facebook`, montado en `/app/data`.
- Firefox corre sin privilegios. Se observan filtros seccomp adicionales de contenido y NoNewPrivs, sin desactivar el aislamiento.
- `/health` informa estado y respuesta autónoma confirmada durante ese inicio. No muestra credenciales, clientes ni textos. No hay rutas públicas para subir sesiones o controlar el navegador.
- Imagen oficial pública de Node y descarga de una revisión fija del código público. La integración de GitHub en Railway no permitió enlazar directamente el repositorio. La web principal y la rama de WhatsApp no se modificaron.

## Comprobaciones

```bash
npm test
bash PROBAR_COMENTARIOS.sh
```

68 pruebas aprobadas: 29 comentarios, 7 menú de orden, 8 conexión/reintentos, 6 nube/aislamiento y 18 del chat anterior. Los transportes son simulados; la demo no publica. Una prueba del navegador no equivale a una prueba real del bot autenticado.

La fuente pública excluye sesiones, perfiles, bases privadas, claves y dependencias instaladas. Conserva `verifiedPage=false` y `allowSending=false`; las comprobaciones reales y la vinculación son necesarias para habilitar envíos.
