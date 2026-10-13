# SCALA · Facebook en Supabase Free

Servicio activo de comentarios para la Página **Scala Kids**. Usa los avisos oficiales de Meta y una base privada en el proyecto gratuito de Supabase de **ServidoChat**. La app está publicada y las claves están cifradas en Vault. El 13 de octubre de 2026 se verificó una respuesta del servicio a un comentario real de una cuenta ajena a los roles de la app y del negocio, en un reel de esta Página.

- Página pública: https://www.facebook.com/profile.php?id=61595400568225
- ID de Página de Meta Business Suite y Graph: `1369521966245025`.
- App autorizada: SCALA Comentarios, `1175553238884267`.
- Endpoint desplegado: `https://tysbnwvzbtolgydceovl.supabase.co/functions/v1/scala-fe-comments`.
- Webhook: el mismo endpoint seguido de `/webhook`.

## Mensaje

> ¡Hola! 😊 Soy el asistente virtual de SCALA.
>
> Si quieres saber más sobre el producto, escríbenos por WhatsApp 💙.

Responde a comentarios de texto nuevos en publicaciones y videos de la Página autorizada, incluidas sus publicaciones antiguas. La recuperación privada permite reintentar comentarios de las últimas 24 horas que se descartaron antes de enviar una respuesta. No migra publicaciones del perfil anterior, no recorre el historial completo, no atiende mensajes privados y no confirma pagos o entregas.

Comprueba la firma, la fecha, el ID del comentario, la propiedad de la publicación, su contenido actual y las respuestas previas. Comprueba también el autor cuando Meta facilita ese campo; si lo omite, utiliza una referencia al comentario sin deducir la identidad de la persona. La lectura de Graph rechaza comentarios anidados, ocultos, privados o de la propia Página. Reserva cada intento antes de enviar; un resultado incierto nunca se vuelve a publicar automáticamente. BAJA pausa al autor cuando su identificador está disponible; si se omite, se descarta ese comentario BAJA.

## Preparación y activación

La función se despliega con las respuestas **desactivadas**. `schema.sql` prepara exclusivamente el esquema privado `scala_fb_private`, sus índices y un trabajo de recuperación. Los datos del chat existente y sus funciones se conservan.

Las credenciales se guardan cifradas en **Supabase Vault**. Los nombres reservados para esta Página son:

- `scala_fb_1369521966245025_app_secret`: secreto de la app SCALA Comentarios.
- `scala_fb_1369521966245025_page_token`: token de tipo PAGE para la Página nueva.
- `scala_fb_1369521966245025_verify_token`: secreto generado para el desafío del webhook.
- `scala_fb_1369521966245025_wake_token`: secreto generado para la recuperación privada.
- `scala_fb_1369521966245025_peer_key`: clave estable para respetar bajas.

Los dos primeros requieren autorización para transmitir esas credenciales concretas a Supabase. Nunca deben aparecer en GitHub, capturas, mensajes públicos o archivos descargables. No se solicita la contraseña de Facebook para el servicio.

La vinculación autorizada corresponde exclusivamente a Scala Kids, antes llamada Scala Fe - SCALA, con el mismo ID de Graph. El token permanente de Página se comprobó en el depurador de Meta con caducidad «Nunca» y se guardó directamente en Vault. Meta puede invalidar la conexión por cambios de permisos, seguridad o vencimiento de acceso a datos. El acceso a datos mostrado por Meta llega al 11 de enero de 2027. El cron está activo y el estado real se consulta en `/health`.

La autorización utiliza `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_engagement` y `pages_read_user_content`; `pages_show_list` permite localizar y seleccionar la Página durante la vinculación. Se selecciona únicamente Scala Kids. El servicio no solicita permisos para mensajes privados, anuncios, publicación de posts ni datos adicionales de perfiles.

Después de vincular las credenciales, el operador cambia la fila `enabled` a `1`. El servicio valida la app, el tipo y permisos del token, el ID inmutable de la Página y ambas suscripciones. El nombre visible no participa en la autorización: renombrar la Página conserva la conexión y otra Página con el mismo nombre continúa bloqueada.

El webhook POST se autentica con HMAC SHA-256 sobre sus bytes exactos. `/wake` y `/recover` requieren el mismo secreto privado. `/recover` acepta sólo un ID de publicación de la Página vinculada, comprueba su propietario en Graph y examina hasta 50 comentarios recientes. Reencola únicamente trabajos descartados sin intento previo, cuyo post, fecha y hash siguen coincidiendo. Los trabajos enviados o inciertos no se reactivan. La verificación JWT del Gateway permanece desactivada porque la autenticación de Meta se realiza con su firma; no hay rutas públicas de configuración ni de acceso a secretos.

## Coste y disponibilidad

El proyecto existente y su organización tienen plan Free. No se crea un proyecto de pago ni se activa una suscripción. Los límites oficiales incluyen 500.000 invocaciones mensuales de funciones, 500 MB de base de datos y la posible pausa de proyectos tras siete días sin actividad. El límite de una función gratuita es 150 segundos de duración y dos segundos de CPU. No se promete servicio ilimitado ni demora cero.

La recuperación de la cola se revisa cada minuto cuando el bot está habilitado. Los avisos nuevos despiertan el procesamiento mediante `EdgeRuntime.waitUntil`; cada ejecución atiende hasta cinco trabajos con una reserva global de Página. Hay un máximo global de 100 intentos por día. Cuando Meta entrega un ID de autor, se permiten tres intentos diarios y un intervalo de cinco minutos por autor; sin ese dato se aplica una clave por comentario y el límite global. La cola admite hasta 1.000 trabajos pendientes.

Una vez vinculado y comprobado, funciona desde la nube con la computadora del usuario apagada, mientras el proyecto y la conexión con Meta permanezcan activos.

## Privacidad y comprobación

El esquema privado mantiene IDs, fechas, hash del texto y estados. No guarda el texto ni nombres de clientes. Los registros de comentarios se eliminan después de 30 días durante el mantenimiento activo; las bajas permanecen hasta una solicitud real de reanudación o eliminación. `/privacidad` y `/eliminacion-datos` describen el procedimiento manual y no afirman haber registrado automáticamente solicitudes.

`/health` muestra el estado sin secretos. `respuestaAutonomaVerificada` requiere leer en Meta el ID devuelto por un envío propio, con autor, padre y texto exactos. `publicoGeneralVerificado` requiere que el operador registre el ID de una respuesta confirmada a una cuenta ajena a los roles de la app y del negocio. Acredita esa prueba en esta Página; no afirma haber obtenido permisos avanzados ni acceso a otras páginas.

Las 16 pruebas locales usan credenciales ficticias y comprueban firma, conexión, cambios de nombre, comentarios de video con autor omitido, rechazo de comentarios anidados, recuperación privada y prevención de duplicados. Incluyen el serializador real de Postgres.js para comprobar el array JSONB de la cola. Una comprobación SQL con rollback confirmó que se reencola un comentario descartado, se conserva su autor conocido y se rechazan trabajos ya enviados o con texto modificado. Las tablas privadas deniegan acceso a anon y authenticated; los avisos sin firma se rechazan con HTTP 403.

## Prueba real y reparación

El webhook de Facebook llegaba al servidor, pero la inserción fallaba con PostgreSQL `22023`: una lista preconvertida con `JSON.stringify` era serializada de nuevo por el controlador JSONB. Se sustituyó por un parámetro explícito `tx.json(events)`. El servidor desplegado, versión 5, aceptó también un aviso firmado sin eventos con HTTP 200; ese aviso de diagnóstico no publicó comentarios.

Después de desplegar la corrección se añadió públicamente un comentario identificado como prueba a la publicación del cuento. Facebook emitió el aviso firmado, la función lo guardó y respondió en el mismo hilo sin navegador ni proceso de escritorio. El ledger conserva el ID que devolvió el envío, comprobado mediante lectura posterior de Meta:

- Comentario: `122096726925513352_2565825327230462`.
- Respuesta automática: `122096726925513352_1785806026243194`.
- Estado: `sent`.
- Comprobación: `2026-10-13T12:03:59.947Z`.
- Publicación: https://www.facebook.com/permalink.php?story_fbid=pfbid02fNniSb7MSFfo37TqekBjqXgsXf1rSWbXasdFhHmmapAtBXc7SHZiz5mCjeCFknYZl&id=61595400568225

La primera respuesta se observó también en Facebook y demostró el recorrido comentario → webhook → base privada → respuesta con la cuenta administradora. La prueba externa posterior se describe a continuación. Se mantienen los permisos existentes y no se afirma haber aprobado una revisión avanzada.

## Reparación de comentarios de videos

El cambio de nombre a Scala Kids bloqueaba la revalidación porque el código exigía el nombre anterior. Además, Meta omitía el campo `from` en la lectura de un comentario externo, y el requisito de autor lo descartaba. La autorización ahora utiliza el ID inmutable de la Página; los comentarios sin datos personales se identifican por su propio ID y se vuelven a comprobar en Graph antes del envío. Los avisos de video pueden traer un `parent_id` diferente del ID de publicación; Graph decide si el comentario es de primer nivel.

Tras desplegar la reparación se recuperó el comentario público «Precio» de una cuenta distinta, descartado por la versión anterior. La función respondió desde Supabase y comprobó el resultado en Graph. La respuesta se observó en la interfaz de Facebook. Los roles de la app y las personas asignadas al activo en Meta Business Suite no incluían a la autora de la prueba.

- Reel: https://www.facebook.com/reel/1801078344369870
- Comentario: `122097301485513352_1719449495812172`.
- Respuesta confirmada: `122097301485513352_2064621624211214`.
- Estado: `sent`.
- Comprobación: `2026-10-13T23:37:22.851Z`.
- El aviso perdido se recuperó expresamente; los comentarios nuevos utilizan el webhook normal. Esta prueba no promete demora cero ni disponibilidad ilimitada.

```bash
npm test
```

## Dependencias

Postgres.js `3.4.7`, fijado en `deno.json` y `package-lock.json` con integridad de npm (licencia Unlicense). Para comprobar tipos localmente: `npm ci --ignore-scripts` y `deno check --node-modules-dir=manual index.ts`. Los controles de Meta se reutilizan del código de SCALA probado anteriormente. La conexión privada utiliza el `SUPABASE_DB_URL` incorporado de la función; no se divulgan claves administrativas a clientes.

## Documentación oficial

- https://supabase.com/pricing
- https://supabase.com/docs/guides/functions/connect-to-postgres
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/database/vault
