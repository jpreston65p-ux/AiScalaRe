# SCALA Comentarios — API oficial de Meta

Servidor Node 24 sin Firefox ni dependencias externas. Recibe webhooks firmados del campo `feed` y responde únicamente a comentarios nuevos, de texto y de primer nivel, en publicaciones de Scala Fe. No usa Gemini ni necesita una API de IA para el mensaje breve solicitado.

## Vinculación

- App propia: SCALA Comentarios, `1175553238884267`.
- Página única autorizada: Scala Fe, `61576458508649`.
- Permisos: `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_engagement`, `pages_read_user_content`; `pages_show_list` sirve para seleccionar la Página en Meta.
- Configurar el origen HTTPS público del servidor mediante `PUBLIC_URL` o `RAILWAY_PUBLIC_DOMAIN`.
- Completar `/configuracion` con la clave de **esta app** y un **token de Página**, emitido para esa app y esa Página. Nunca pegar claves en el chat o subirlas a Git.
- La vinculación valida la app, el emisor del token, sus permisos y la identidad numérica de la Página. Después registra el webhook de la app y la suscripción `feed` de la Página mediante Graph API.
- La activación técnica no demuestra que Meta permita atender a visitantes fuera de los roles de prueba. Revisar publicación/permisos de Meta y confirmar una respuesta real antes de declarar que funciona para todo el público.

## Operación y límites

La PC puede estar apagada cuando el servidor y la conexión con Meta estén funcionando. El plan de alojamiento conserva sus límites de crédito y uso. Una clave vencida, permisos revocados o una revisión pendiente de Meta pueden detener la atención.

`GET /health` informa estado sin exponer claves. `GET/POST /webhook` solo acepta verificaciones y avisos autorizados. `/configuracion` no muestra claves guardadas; una configuración nueva requiere credenciales válidas de la misma app y Página y autorización explícita.

Deduplicación en SQLite, cola durable, verificación del hilo y de respuestas propias, límite de 100 al día y tres por autor al día. Una respuesta incierta se comprueba, pero no se vuelve a publicar automáticamente. `BAJA` detiene atención al autor. No se guardan textos de comentarios; los registros caducan a los 30 días. Los avisos dependen de Meta y no se promete respuesta instantánea.

Los documentos de privacidad describen el comportamiento real del servidor. La solicitud de eliminación requiere atención del equipo; no se afirma que una solicitud fue registrada o resuelta automáticamente.

## Desarrollo

`npm test`, `node src/server.mjs`. Datos locales en `./data/meta` o en `SCALA_FACEBOOK_DATA_DIR/meta`. Las claves y SQLite nunca pertenecen a Git. En Railway se conserva el volumen privado existente y se ejecuta `scripts/nube.sh` como usuario `node`.
