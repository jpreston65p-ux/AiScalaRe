# SCALA · Facebook en Supabase Free

Servicio activo de comentarios para la Página **Scala Fe - SCALA**. Usa los avisos oficiales de Meta y una base privada en el proyecto de Supabase ya conectado, dentro de la organización **ServidoChat**, cuyo plan se verificó como **Free**. La app está publicada, las claves están cifradas en Vault y se verificó una respuesta automática real el 13 de octubre de 2026. Sigue pendiente la prueba con una persona ajena a los roles de la app; la prueba realizada utiliza la cuenta administradora.

- Página pública: https://www.facebook.com/profile.php?id=61595400568225
- ID de Página de Meta Business Suite y Graph: `1369521966245025`.
- App autorizada: SCALA Comentarios, `1175553238884267`.
- Endpoint desplegado: `https://tysbnwvzbtolgydceovl.supabase.co/functions/v1/scala-fe-comments`.
- Webhook: el mismo endpoint seguido de `/webhook`.

## Mensaje

> ¡Hola! 😊 Soy el asistente virtual de SCALA.
>
> Si quieres saber más sobre el producto, escríbenos por WhatsApp 💙.

Sólo responde a comentarios de texto nuevos en publicaciones de la Página autorizada. Una publicación antigua de esa Página puede recibir respuestas a comentarios nuevos. No migra publicaciones del perfil anterior, no recupera comentarios históricos, no atiende mensajes privados y no confirma pagos o entregas.

Comprueba firma, fecha, autor, publicación, ediciones y respuestas previas. Reserva cada intento antes de enviar. Si Meta no devuelve un resultado verificable, conserva el intento como incierto y no vuelve a publicar. BAJA pausa respuestas al autor; su identificador HMAC utiliza una clave estable distinta de la clave de Meta.

## Preparación y activación

La función se despliega con las respuestas **desactivadas**. `schema.sql` prepara exclusivamente el esquema privado `scala_fb_private`, sus índices y un trabajo de recuperación. Los datos del chat existente y sus funciones se conservan.

Las credenciales se guardan cifradas en **Supabase Vault**. Los nombres reservados para esta Página son:

- `scala_fb_1369521966245025_app_secret`: secreto de la app SCALA Comentarios.
- `scala_fb_1369521966245025_page_token`: token de tipo PAGE para la Página nueva.
- `scala_fb_1369521966245025_verify_token`: secreto generado para el desafío del webhook.
- `scala_fb_1369521966245025_wake_token`: secreto generado para la recuperación privada.
- `scala_fb_1369521966245025_peer_key`: clave estable para respetar bajas.

Los dos primeros requieren autorización para transmitir esas credenciales concretas a Supabase. Nunca deben aparecer en GitHub, capturas, mensajes públicos o archivos descargables. No se solicita la contraseña de Facebook para el servicio.

La vinculación autorizada ya se completó exclusivamente para Scala Fe - SCALA. El token permanente de Página se comprobó en el depurador de Meta con caducidad «Nunca» y se guardó directamente en Vault. Esto no impide que Meta invalide la conexión por cambios de permisos, seguridad o vencimiento de acceso a datos; en ese caso hace falta renovar la autorización. El acceso a datos mostrado por Meta llega al 11 de enero de 2027. El cron está activo y las filas de estado `enabled` y `ready` tienen valor `1`.

La autorización de Meta se prepara para `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_engagement` y `pages_read_user_content`; `pages_show_list` permite localizar y seleccionar la Página durante la vinculación. Se selecciona únicamente Scala Fe - SCALA. El servicio no solicita permisos para mensajes privados, anuncios ni publicación de posts.

Después de vincular las credenciales y completar los requisitos de Meta, el operador cambia la fila `enabled` a `1`. El servicio valida la app, el tipo y permisos del token, el ID y nombre de la Página y ambas suscripciones. Si alguna comprobación falla, no habilita envíos.

El webhook POST se autentica con HMAC SHA-256 sobre sus bytes exactos. `/wake` requiere su secreto privado; la verificación JWT del Gateway se desactiva específicamente porque Meta no utiliza JWT de Supabase. No se añaden rutas públicas de configuración ni de acceso a secretos.

## Coste y disponibilidad

El proyecto existente y su organización tienen plan Free. No se crea un proyecto de pago ni se activa una suscripción. Los límites oficiales incluyen 500.000 invocaciones mensuales de funciones, 500 MB de base de datos y la posible pausa de proyectos tras siete días sin actividad. El límite de una función gratuita es 150 segundos de duración y dos segundos de CPU. No se promete servicio ilimitado ni demora cero.

La recuperación se revisa cada minuto y sólo llama a la función cuando el bot está habilitado. Los avisos nuevos despiertan el procesamiento inmediatamente mediante `EdgeRuntime.waitUntil`; cada ejecución atiende hasta cinco trabajos con una reserva global de Página. Límites de envíos: 100 intentos por día, tres por autor y cinco minutos entre intentos del mismo autor. La cola admite hasta 1.000 trabajos pendientes.

Una vez vinculado y comprobado, funciona desde la nube con la computadora del usuario apagada, mientras el proyecto y la conexión con Meta permanezcan activos.

## Privacidad y comprobación

El esquema privado mantiene IDs, fechas, hash del texto y estados. No guarda el texto ni nombres de clientes. Los registros de comentarios se eliminan después de 30 días durante el mantenimiento activo; las bajas permanecen hasta una solicitud real de reanudación o eliminación. `/privacidad` y `/eliminacion-datos` describen el procedimiento manual y no afirman haber registrado automáticamente solicitudes.

`/health` muestra el estado, sin secretos. `respuestaAutonomaVerificada` sólo se activa después de leer en Meta el ID devuelto por un envío propio, con autor, padre y texto exactos. `publicoGeneralVerificado` permanece en `false`: requiere completar los requisitos de publicación de Meta y observar una prueba externa, fuera de los roles de la app.

Las diez pruebas locales usan credenciales ficticias. Nueve comprueban firma, conexión y envíos con Graph simulado; la décima usa el serializador y el enlace de parámetros de Postgres.js para impedir que la cola reciba un string JSON en lugar de un array JSONB. La comprobación reversible de SQL verificó la reserva de envío, unicidad, bloqueo por arrendamiento vencido y presupuesto diario. Las tablas privadas deniegan acceso a los roles anon y authenticated. La función devuelve estado sin secretos y rechaza avisos sin firma con HTTP 403.

## Prueba real y reparación

El webhook de Facebook llegaba al servidor, pero la inserción fallaba con PostgreSQL `22023`: una lista preconvertida con `JSON.stringify` era serializada de nuevo por el controlador JSONB. Se sustituyó por un parámetro explícito `tx.json(events)`. El servidor desplegado, versión 5, aceptó también un aviso firmado sin eventos con HTTP 200; ese aviso de diagnóstico no publicó comentarios.

Después de desplegar la corrección se añadió públicamente un comentario identificado como prueba a la publicación del cuento. Facebook emitió el aviso firmado, la función lo guardó y respondió en el mismo hilo sin navegador ni proceso de escritorio. El ledger conserva el ID que devolvió el envío, comprobado mediante lectura posterior de Meta:

- Comentario: `122096726925513352_2565825327230462`.
- Respuesta automática: `122096726925513352_1785806026243194`.
- Estado: `sent`.
- Comprobación: `2026-10-13T12:03:59.947Z`.
- Publicación: https://www.facebook.com/permalink.php?story_fbid=pfbid02fNniSb7MSFfo37TqekBjqXgsXf1rSWbXasdFhHmmapAtBXc7SHZiz5mCjeCFknYZl&id=61595400568225

La respuesta se observó también en la interfaz pública de Facebook. Se demostró el recorrido real comentario → webhook → base privada → respuesta de la Página. Esto confirma el funcionamiento desde Supabase con independencia de la computadora local; no demuestra todavía el alcance para clientes fuera de los roles de la app. Meta muestra los cinco permisos como «Listo para la prueba» y ofrece agregarlos a revisión. No se han solicitado permisos adicionales ni se afirma haber aprobado una revisión avanzada.

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
