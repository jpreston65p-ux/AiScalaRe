# SCALA WhatsApp en Railway

Este bot atiende consultas del catálogo por WhatsApp Business mediante un dispositivo vinculado con QR. No requiere una clave de Gemini. Su atención usa reglas y el catálogo; no genera respuestas libres con IA.

En Railway funciona mientras el servicio esté desplegado, tenga conexión con WhatsApp y disponga de recursos/crédito. Tu PC puede estar apagada después de vincular. No se garantiza alojamiento gratuito permanente: el crédito de prueba y la cuota del plan gratuito son limitados. Revisa el saldo y el uso en tu cuenta; este proyecto no compra ni cambia tu plan.

## Configuración del servicio

1. Fuente: la rama `scala-whatsapp-cloud` de `jpreston65p-ux/AiScalaRe`, raíz `/`. El sitio web usa su propia rama `main`.
2. Compilación: Dockerfile. `railway.json` ejecuta `node src/railway.mjs`.
3. Un solo servicio y una sola réplica. Adjunta un volumen persistente a **`/app/data`** antes de vincular. No uses un disco temporal para guardar la sesión.
4. Variables: **`SCALA_DATA_DIR=/app/data`**, **`RAILWAY_RUN_UID=0`** para permitir el acceso al volumen de Railway. Opcional: `SCALA_DAILY_LIMIT=1000`.
5. Desactiva el modo de suspensión/serverless. Es un proceso continuo y no necesita dominio público ni puerto HTTP.
6. Revisa que tu cuenta permita conexiones salientes a WhatsApp. Algunas cuentas de prueba tienen restricciones hasta completar la verificación.

El proceso se mantiene esperando mientras falta la sesión. El QR nunca aparece en los logs del despliegue. El servidor comprueba el volumen, espera a que finalice la vinculación y después inicia el bot. La base contiene credenciales privadas: no publiques ni compartas `/app/data`, copias de la base o códigos QR.

## Vinculación privada desde Linux Mint

Instala/inicia sesión en la CLI oficial de Railway desde tu terminal. Abre la consola SSH del servicio con `railway ssh` seleccionando el proyecto y el servicio de SCALA. La CLI puede pedir registrar tu clave SSH la primera vez.

Antes de vincular, si tienes el servicio antiguo ejecutándose en tu PC, detenlo para evitar respuestas duplicadas:

```bash
sudo systemctl stop scala-whatsapp-qr.service
```

Dentro de la consola SSH del servicio:

```bash
node scripts/vincular-nube.mjs
```

En el celular: **WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo**. Escanea el QR de tu terminal. El proceso guarda la sesión en el volumen, sale y el servidor inicia automáticamente la atención. Puedes cerrar la terminal y apagar tu PC una vez comprobada la respuesta.

Prueba desde otro número enviando **hola**, **1**, **1** y **MENÚ**. Los logs deben mostrar `whatsapp_conectado` y el diagnóstico debe registrar una `ultimaRespuesta` nueva:

```bash
node scripts/diagnostico.mjs
```

Una sesión guardada o un despliegue activo por sí solos no prueban que WhatsApp esté conectado: comprueba una respuesta real.

## Si WhatsApp desvincula la sesión

Abre de nuevo `railway ssh` y ejecuta:

```bash
node scripts/vincular-nube.mjs --revincular
```

Esto pausa el bot, descarta únicamente sus credenciales y solicita un QR nuevo. Conserva el catálogo y las preferencias de atención. Si la terminal se interrumpe bruscamente puede quedar el archivo `/app/data/cloud.pause`: comprueba que no haya otra vinculación abierta y elimina solo ese archivo para reanudar.

## Catálogo y atención

Edita `catalogo.json` para cambiar los productos y redepliega conservando el volumen. Los precios y formas de pago sin confirmar se derivan a atención humana. `BAJA` detiene las respuestas para ese cliente y `MENÚ` reactiva el bot. Una respuesta manual del equipo pausa la atención automática de ese chat.

El método QR utiliza una biblioteca externa para vincular un dispositivo, no la API oficial de WhatsApp. Su compatibilidad puede cambiar y WhatsApp puede cerrar la sesión. No se debe prometer disponibilidad ininterrumpida.

Referencias oficiales: [Railway: prueba gratuita](https://docs.railway.com/pricing/free-trial), [precios](https://docs.railway.com/pricing/plans), [volúmenes](https://docs.railway.com/volumes/reference), [SSH](https://docs.railway.com/cli/ssh).
