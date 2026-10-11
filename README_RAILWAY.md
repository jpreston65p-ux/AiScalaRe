# SCALA WhatsApp en Railway

Este bot atiende consultas del catálogo por WhatsApp Business mediante un dispositivo vinculado con QR. No requiere una clave de Gemini. Su atención usa reglas y el catálogo; no genera respuestas libres con IA.

En Railway funciona mientras el servicio esté desplegado, tenga conexión con WhatsApp y disponga de recursos/crédito. Tu PC puede estar apagada después de vincular. No se garantiza alojamiento gratuito permanente: el crédito de prueba y la cuota del plan gratuito son limitados. Revisa el saldo y el uso en tu cuenta; este proyecto no compra ni cambia tu plan.

## Configuración del servicio

1. Código: la rama `scala-whatsapp-cloud` de `jpreston65p-ux/AiScalaRe`, raíz `/`. El sitio web usa su propia rama `main`. El despliegue inicial se realiza directamente con la CLI oficial; no requiere instalar la aplicación de Railway en GitHub.
2. Compilación: Dockerfile. Configura el comando de inicio **`node src/railway.mjs`** en el servicio. Este proyecto ya está configurado mediante la conexión de Railway; no usa el formato antiguo `railway.json`.
3. Un solo servicio y una sola réplica. Adjunta un volumen persistente a **`/app/data`** antes de vincular. No uses un disco temporal para guardar la sesión.
4. Variables: **`SCALA_DATA_DIR=/app/data`**, **`RAILWAY_RUN_UID=0`** para permitir el acceso al volumen de Railway. Opcional: `SCALA_DAILY_LIMIT=1000`.
5. Desactiva el modo de suspensión/serverless. Es un proceso continuo y no necesita dominio público ni puerto HTTP.
6. Revisa que tu cuenta permita conexiones salientes a WhatsApp. Algunas cuentas de prueba tienen restricciones hasta completar la verificación.

El proceso se mantiene esperando mientras falta la sesión. El QR nunca aparece en los logs del despliegue. El servidor comprueba el volumen, espera a que finalice la vinculación y después inicia el bot. La base contiene credenciales privadas: no publiques ni compartas `/app/data`, copias de la base o códigos QR.

## Vinculación desde la consola web privada

En Railway, abre el servicio **scala-whatsapp → Console**. Esta consola utiliza tu sesión de Railway y no necesita instalar la CLI ni registrar una clave SSH nueva.

Antes de escanear, detén el bot antiguo en la terminal de tu PC para evitar respuestas duplicadas:

```bash
sudo systemctl stop scala-whatsapp-qr.service
```

En la consola web de Railway ejecuta:

```bash
node scripts/vincular-nube.mjs
```

En el celular abre **WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo** y escanea el QR de esa consola. La vinculación guarda las credenciales en el volumen privado y el servidor inicia la atención automáticamente. Comprueba una respuesta real desde otro número antes de apagar tu PC.

## Alternativa desde la terminal de Linux Mint

Descarga **`VINCULAR_RAILWAY_MINT.sh`** en Descargas y ejecútalo desde tu terminal:

```bash
bash "$(xdg-user-dir DOWNLOAD)/VINCULAR_RAILWAY_MINT.sh"
```

El archivo utiliza la CLI oficial de Railway fijada en la versión 5.64.2, pide iniciar sesión si hace falta y abre el proyecto y servicio de SCALA con sus identificadores reales. Este método requiere una clave SSH personal ya registrada en Railway; el script no la genera ni la registra. Si no tienes una, utiliza la consola web descrita arriba. Si el bot local está activo, el archivo lo detiene para evitar respuestas duplicadas.

Proyecto: [SCALA WhatsApp en Railway](https://railway.com/project/86dc9c33-9042-48a9-8201-b94e04232179).

Para actualizar el servidor desde una copia de esta rama con la CLI autenticada:

```bash
railway up --project 86dc9c33-9042-48a9-8201-b94e04232179 --environment 7da2eda3-0a63-4bb2-9b2f-d606f18a3987 --service addfbe69-28c0-4ff7-91f2-9b045e49e633 --detach -m "Actualiza SCALA WhatsApp"
```

El comando devuelve cuando comienza la compilación. Revisa que el despliegue llegue a `SUCCESS` en Railway antes de considerar terminada una actualización. Las modificaciones del repositorio no se publican automáticamente mediante este método.

También puedes instalar/iniciar sesión en la CLI oficial por tu cuenta y abrir `railway ssh` seleccionando el proyecto y el servicio de SCALA.

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

Abre de nuevo la consola web privada del servicio o `railway ssh` y ejecuta:

```bash
node scripts/vincular-nube.mjs --revincular
```

Esto pausa el bot, descarta únicamente sus credenciales y solicita un QR nuevo. Conserva el catálogo y las preferencias de atención. Si la terminal se interrumpe bruscamente puede quedar el archivo `/app/data/cloud.pause`: comprueba que no haya otra vinculación abierta y elimina solo ese archivo para reanudar.

## Catálogo y atención

Edita `catalogo.json` para cambiar los productos y redepliega conservando el volumen. Los precios y formas de pago sin confirmar se indican como pendientes; el cliente puede seguir consultando. `BAJA` detiene las respuestas para ese cliente y `MENÚ` reactiva el bot. Una solicitud explícita de atención humana o una respuesta manual del equipo pausa la atención automática de ese chat.

Consulta [la política de atención](POLITICA_ATENCION_SCALA.md) para configurar precio, métodos de pago y horario. Cuando una persona autorizada haya verificado realmente un pago, puede ejecutar **`node scripts/autorizar-entrega.mjs`** en la consola web privada del servicio. La herramienta permite confirmar ese pago, autorizar la entrega y guardar un enlace HTTPS real para ese cliente y producto. No verifica el banco ni envía mensajes por sí sola. El bot podrá incluir el enlace cuando el cliente consulte el pago o solicite su entrega. Si el chat está pausado, el cliente puede escribir **MENÚ**. No publiques el enlace del producto en el catálogo público.

El método QR utiliza una biblioteca externa para vincular un dispositivo, no la API oficial de WhatsApp. Su compatibilidad puede cambiar y WhatsApp puede cerrar la sesión. No se debe prometer disponibilidad ininterrumpida.

Referencias oficiales: [Railway: prueba gratuita](https://docs.railway.com/pricing/free-trial), [precios](https://docs.railway.com/pricing/plans), [volúmenes](https://docs.railway.com/volumes/reference), [SSH](https://docs.railway.com/cli/ssh).
