# SCALA · Facebook en Supabase Free

Servicio de comentarios para la Página **Scala Fe - SCALA**. Usa los avisos oficiales de Meta y una base privada en el proyecto de Supabase ya conectado, dentro de la organización **ServidoChat**, cuyo plan se verificó como **Free**. La Página está creada; sus claves de Meta y la comprobación de una respuesta real siguen pendientes.

La ruta de Cloudflare quedó bloqueada por su comprobación de seguridad en el navegador compartido; esta versión permite aprovechar el alojamiento gratuito existente.

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

Las nueve pruebas locales usan credenciales ficticias y simulan Graph. La comprobación reversible de SQL verificó la reserva de envío, unicidad, bloqueo por arrendamiento vencido y presupuesto diario. Las tablas privadas deniegan acceso a los roles anon y authenticated. La función desplegada devuelve estado sin secretos y rechaza avisos sin firma con HTTP 403. Falta una respuesta real antes de declarar la integración funcional.

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
