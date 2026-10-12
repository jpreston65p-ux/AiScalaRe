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
2. Pulsa Enter en la terminal cuando se vea la cuenta correcta.
3. Si falta acceso a Railway en esa PC, completa el formulario de Railway que abre su herramienta oficial.

El programa verifica cuenta, publicación propia y avisos antes de enviar su sesión al servicio `scala-facebook-comentarios`. El servidor vuelve a verificar identidad y controles antes de publicar. Si Facebook solicita otra verificación o cambia su interfaz, los envíos se detienen y debe revisarse la conexión.

**No escribas contraseñas, códigos ni sesiones en el chat.** Solo se obtiene la sesión del navegador propio de este programa; nunca se lee ni se exporta el navegador de ChatGPT. Se envía por la entrada privada de la herramienta oficial de Railway, al proyecto, entorno y servicio específicos. No se incluye en enlaces, argumentos de comandos, archivos públicos ni consola.

Después del registro `SCALA_CLOUD_WATCHING`, un visitante debe dejar un comentario nuevo para comprobar la respuesta. Solo `SCALA_CLOUD_REPLY_CONFIRMED` demuestra una respuesta autónoma observada. Enviar la sesión o alcanzar `SUCCESS` no demuestran por sí solos que el bot responda.

**Cuando la conexión y la respuesta autónoma estén verificadas, puedes cerrar la terminal y apagar la PC.** Railway debe permanecer activo y la sesión de Facebook debe seguir válida.

Para reconectar una carpeta preparada:

```bash
cd "$(xdg-user-dir DOWNLOAD)/SCALA_FACEBOOK_NUBE"
bash CONECTAR_SCALA_FACEBOOK.sh --nube
```

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

Cabecera decorada, párrafos breves y como máximo dos emojis. Un comentario general recibe un agradecimiento cálido. Las consultas usan únicamente datos confirmados.

Producto: **Gedeón, el valiente obediente**, cuento digital PDF basado en Jueces 6 y 7 para conversar sobre valentía, fe y obediencia. Precio y moneda, pagos, horario y descarga siguen sin configurar. No se inventan descuentos, edades, páginas ni materiales.

El producto se identifica por su mención, asociación configurada o título confirmado en la publicación. Otros comentarios no configuran productos. Si falta contexto, se pide una sola aclaración. Pagos particulares, comprobantes y entregas se orientan a privado sin afirmar acciones no realizadas.

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

52 pruebas aprobadas: 28 comentarios, 6 nube/aislamiento y 18 del chat anterior. Los transportes son simulados; la demo no publica. Una prueba del navegador no equivale a una prueba real del bot autenticado.

La fuente pública excluye sesiones, perfiles, bases privadas, claves y dependencias instaladas. Conserva `verifiedPage=false` y `allowSending=false`; las comprobaciones reales y la vinculación son necesarias para habilitar envíos.
