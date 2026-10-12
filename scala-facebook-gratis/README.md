# SCALA · Comentarios de Facebook en la nube gratuita

Asistente de comentarios para una **Página nueva y administrable de Facebook llamada Scala Fe - SCALA**. Recibe los avisos oficiales de Meta en Cloudflare Workers Free, conserva estados en D1 y usa Cloudflare Queues para atender cada aviso. El servicio no depende de una terminal ni de que el PC esté encendido.

**Estado del proyecto:** Página Scala Fe - SCALA creada el 12 de octubre de 2026; alojamiento y credenciales pendientes de vinculación. Facebook rechazó el nombre exacto Scala Fe por considerarlo duplicado; la nueva Página conserva la marca con el sufijo SCALA. Las pruebas locales utilizan datos ficticios y no demuestran una respuesta real en Facebook. La configuración inicial mantiene las respuestas desactivadas.

Página creada: https://www.facebook.com/profile.php?id=61595400568225 . Meta Business Suite muestra el activo de Página `1369521966245025` y permite administrarla; ese es el ID configurado para Graph. El identificador del perfil mostrado en la URL y el ID del activo de Página son distintos. La conexión comprueba que el token devuelva exactamente el ID de Página configurado antes de habilitar respuestas.

## Mensaje

> ¡Hola! 😊 Soy el asistente virtual de SCALA.
>
> Si quieres saber más sobre el producto, escríbenos por WhatsApp 💙.

No publica precios, pagos, entregas ni números de WhatsApp sin configurar información confirmada. La identidad de la Página y su ID se verifican antes de responder.

## Alcance

- Atiende comentarios de texto nuevos en publicaciones de la Página nueva, aunque la publicación sea anterior a la activación del bot.
- El perfil profesional antiguo `61576458508649` y SCALA KIDS `1121299691061284` quedan excluidos. Crear una Página nueva **no migra seguidores, publicaciones ni comentarios del perfil anterior**.
- No responde a mensajes privados, comentarios antiguos pendientes, comentarios de la propia Página, respuestas dentro de un hilo, comentarios ocultos o privados, contenido editado ni hilos que la Página ya haya atendido.
- Al activarse conserva la fecha inicial; sólo procesa avisos de comentarios posteriores. Comprueba nuevamente la publicación, el comentario y las respuestas justo antes de publicar.
- Acepta BAJA para pausar respuestas al autor. El equipo puede atender solicitudes de eliminación o reanudación manualmente.

## Coste y límites

Usar **Workers Free**, D1 Free y Queues Free. No activar planes de pago, pruebas con facturación ni complementos. No se requiere dominio de pago: funciona con el subdominio `workers.dev` de la cuenta.

La documentación consultada el 12 de octubre de 2026 incluye 100.000 solicitudes de Workers al día y 10.000 operaciones diarias de Queues en el plan gratuito. Cada entrega normal de cola usa tres operaciones. D1 también tiene límites gratuitos. Si se agotan los límites o Meta interrumpe el acceso, el servicio puede dejar de atender; no constituye una garantía de disponibilidad ilimitada o de respuesta instantánea.

El código limita los intentos a 100 al día por Página y tres por autor, con cinco minutos entre intentos del mismo autor. Retiene hasta 1.000 trabajos pendientes y registros de comentarios durante 30 días. La cola atiende avisos al recibirlos; un disparador cada minuto recupera trabajo pendiente o verifica la conexión. Los permisos y la entrega de eventos de Meta también afectan la demora.

## Preparación de Meta

1. Crear la Página nueva Scala Fe - SCALA desde una cuenta administradora. La creación implica aceptar las políticas que Facebook muestra; confirmar ese paso antes de finalizarlo.
2. Obtener el ID **real de la Página nueva**. No usar el ID del perfil profesional antiguo.
3. Configurar la app SCALA `1175553238884267` y obtener un token de tipo **PAGE** para esa misma Página. Permisos necesarios: `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_engagement` y `pages_read_user_content`.
4. Completar los requisitos de acceso, revisión, publicación y verificación que Meta muestre para esta app y estos permisos. Un token válido o una prueba con un administrador no demuestra atención al público general.
5. Guardar los secretos sólo en Cloudflare, con autorización para transmitir las claves a ese servicio. No ponerlos en GitHub, archivos públicos, capturas o chat.

## Despliegue desde Linux Mint

Requiere Node.js 24 y acceso a la cuenta propia de Cloudflare. Estos comandos sólo preparan el alojamiento; no crean la Página de Facebook ni sustituyen la revisión de Meta.

```bash
cd scala-facebook-gratis
npm test
npx wrangler login
npx wrangler d1 create scala-fe-comentarios
npx wrangler queues create scala-fe-comentarios
```

En `wrangler.toml`, sustituir `database_id` por el UUID devuelto por Cloudflare y `SCALA_PAGE_ID` por el ID real de la Página nueva. Mantener `SCALA_ENABLE = "0"` durante la preparación.

```bash
npx wrangler d1 execute scala-fe-comentarios --remote --file schema.sql
npx wrangler deploy
```

Tomar la URL HTTPS real que Cloudflare muestre al desplegar y ponerla, sin ruta, como `SCALA_PUBLIC_ORIGIN`. No utilizar un ejemplo como dirección de producción.

Introducir estas claves mediante los campos privados de Cloudflare o las solicitudes ocultas de Wrangler:

```bash
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_PAGE_TOKEN
npx wrangler secret put META_VERIFY_TOKEN
```

`META_VERIFY_TOKEN` es un valor aleatorio propio de entre 32 y 256 caracteres alfanuméricos, guiones o guiones bajos. No es la contraseña de Facebook ni la clave de Gemini. Se genera para verificar el enlace del webhook y debe coincidir en ambos extremos.

La app se suscribirá al objeto `page`, campo `feed`, en `URL_REAL/webhook`, y después suscribirá la Página a esa app. El desafío de Meta funciona aunque las respuestas estén desactivadas. Los avisos POST requieren firma HMAC válida sobre los bytes exactos.

Después de confirmar las credenciales y permisos, cambiar `SCALA_ENABLE` a `"1"` y desplegar. El primer disparador comprueba la app, token, Página y suscripciones. Si falla, no habilita respuestas. Para pausar, volver a `"0"` y desplegar.

## Comprobación necesaria antes de declarar que funciona

1. Visitar `/health`: inicialmente debe indicar configuración pendiente o respuestas pausadas.
2. Verificar que la app y la Página se han vinculado y que el estado indica `conectada_para_pruebas`.
3. Publicar un comentario nuevo de prueba en una publicación de la Página nueva, mediante un autor autorizado para las pruebas. Observar en Facebook la respuesta con el texto exacto y comprobar `respuestaAutonomaVerificada`.
4. Repetir con una persona ajena a los roles de prueba después de completar los requisitos de Meta. El código mantiene `publicoGeneralVerificado` en `false`: este resultado necesita evidencia externa y no se deduce automáticamente de las credenciales.
5. Probar un aviso repetido: sólo debe existir una respuesta. Comprobar que el servicio continúa sin el PC local.

Un envío cuyo resultado no se puede confirmar se conserva como incierto; se revisa después y no se vuelve a publicar. Esto puede dejar una consulta sin respuesta si Meta aceptó el mensaje pero no devolvió un ID verificable. Se prioriza evitar duplicados.

## Datos y privacidad

- D1 conserva IDs de Página, publicación, autor y comentario, fechas, hash del texto y estados. No conserva el texto del cliente ni su nombre.
- Las bajas se conservan con un identificador HMAC para respetarlas; permanecen hasta que el equipo las elimine conforme a una solicitud real.
- Las claves de Meta se guardan como secretos privados de Cloudflare. No se utilizan cookies, sesiones del navegador, contraseñas ni códigos del usuario.
- Los enlaces `/privacidad` y `/eliminacion-datos` describen estos usos y el procedimiento manual. No afirman haber registrado automáticamente solicitudes.
- Consultar estos textos y los requisitos aplicables antes de abrir la atención al público. En la configuración de la app, usar las URLs reales del servicio y los datos confirmados de SCALA.

## Pruebas locales

```bash
npm test
```

Las pruebas usan SQLite real para ejercitar las consultas y reservas atómicas, y simulan Graph y la cola. Verifican el recorrido HTTP firmado → D1 → cola → Graph → lectura de la respuesta, sin enviar mensajes reales. No hay dependencias para ejecutar el Worker; `src/index.mjs` es un módulo único compatible con las APIs web.

## Documentación oficial

- [Cloudflare Workers](https://www.cloudflare.com/developer-platform/products/workers/)
- [Precios de D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Precios de Queues](https://developers.cloudflare.com/queues/platform/pricing/)
- [Configuración de Queues](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Webhooks de Meta](https://developers.facebook.com/docs/graph-api/webhooks/)
- [Políticas de páginas, grupos y eventos](https://www.facebook.com/policies_center/pages_groups_events/)
