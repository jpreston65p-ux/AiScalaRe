# SCALA WhatsApp por QR

Este proyecto conecta tu WhatsApp Business como un dispositivo vinculado. Escaneas un QR desde el celular. No requiere crear una empresa en Meta Business Suite ni proporcionar una API key para funcionar.

**Estado de la entrega:** código preparado y probado con mensajes simulados. Todavía no hay un número vinculado ni un servidor tuyo de la nube instalado. El QR real aparece cuando ejecutas el proyecto y WhatsApp lo emite; no se incluye un QR falso en el ZIP.

Baileys es una biblioteca no oficial. WhatsApp puede desconectar o restringir el uso; no se garantiza una conexión permanente ni compatibilidad después de cambios del servicio. Úsalo para atender mensajes que tus clientes te envían. Este proyecto no hace campañas, envíos masivos ni inicia conversaciones.

## 1. Prueba en Linux Mint

Descarga y extrae el ZIP en tu carpeta Descargas. Abre una terminal:

```bash
cd "$HOME/Descargas/SCALA_WHATSAPP_QR"
bash INICIAR_SCALA_WHATSAPP.sh
```

Si tu carpeta se llama Downloads, usa `cd "$HOME/Downloads/SCALA_WHATSAPP_QR"`.

El primer inicio prepara Node.js 24 y las dependencias. Si tu Mint tiene Node.js 18, se descarga una versión privada de Node.js desde nodejs.org y se comprueba su SHA-256. Se guarda en la carpeta de datos de tu usuario (`~/.local/share/scala-whatsapp/node24` por defecto). Se conserva la instalación de Node.js del sistema. Necesitas Internet, curl o wget, tar, xz y Linux de 64 bits (x64 o arm64).

Cuando salga el QR, en **WhatsApp Business → menú ⋮ → Dispositivos vinculados → Vincular un dispositivo**, escanéalo. La sesión se guarda en la carpeta privada `data/`.

Escribe desde otro número a tu WhatsApp Business: `hola`. Debes recibir el menú de SCALA. Comprueba selección de Gedeón, consulta de precio, atención humana, `BAJA` y `MENÚ`.

Ctrl+C detiene esta prueba. **Si ejecutas el bot solamente en tu PC, al apagarla deja de responder.** Para que siga atendiendo con tu PC apagada, realiza el siguiente paso en un servidor de la nube.

Para mantenerlo en segundo plano en Mint y arrancar al encender la PC, termina la prueba con Ctrl+C y ejecuta `bash INSTALAR_SERVICIO.sh`. Comprueba `bash CONTROLAR_SCALA.sh estado` y un mensaje desde otro número. La PC debe permanecer encendida, con Internet y sin suspenderse.

Si una versión anterior muestra `sesionGuardada: false` después de haber conectado y respondido, ejecuta `bash REPARAR_SCALA_SERVICIO.sh`. Corrige la comprobación de credenciales QR y después instala el servicio. Conserva `data/` y `catalogo.json`. Si WhatsApp realmente cerró la sesión, vuelve a vincular con `bash INICIAR_SCALA_WHATSAPP.sh --solo-vincular --revincular` y espera a que confirme que la sesión quedó guardada antes de instalar el servicio.

## 2. Ejecutarlo en la nube desde la terminal de Mint

Necesitas un servidor Linux con acceso SSH y disco persistente, por ejemplo un VPS con Ubuntu/Debian y systemd. La biblioteca es gratuita; el alojamiento depende del proveedor y de tu cuenta. No se promete alojamiento ilimitado gratuito.

El servidor publicado anteriormente para SCALA AI usa Workers y no mantiene el proceso persistente de este bot por QR. La web pública de SCALA AI sigue funcionando por separado.

Desde la carpeta del proyecto en Mint:

```bash
bash SUBIR_A_NUBE.sh
```

Introduce **tu servidor real** como `usuario@IP` o `usuario@dominio`. No pegues contraseñas en este archivo ni en el chat. SSH utilizará tu clave o te pedirá la contraseña de forma normal. Si el servidor usa un puerto especial, configúralo antes en tu configuración de SSH.

El script sube solamente el código y el catálogo, prepara Node.js en el servidor y muestra el QR **del servidor de la nube** en tu terminal. Escanéalo. Después instala el servicio de SCALA; si tu usuario usa sudo, el servidor te pedirá su contraseña.

El servicio se inicia automáticamente cuando se enciende el servidor y se reinicia tras errores recuperables. Tu PC puede apagarse, pero el servidor debe permanecer encendido, con Internet y su disco disponible. No sirve un alojamiento que duerma o borre la sesión entre reinicios.

No se copia una sesión de WhatsApp desde tu PC al servidor. Se vincula directamente en la nube. Ejecuta una sola instancia por sesión. Al instalar una actualización sobre este mismo servidor, el script conserva `data/` y sustituye el código y el catálogo por los de tu proyecto local.

### Instalación manual en el servidor

Si ya subiste la carpeta por tus propios medios, entra por SSH y ejecuta dentro de ella:

```bash
bash INICIAR_SCALA_WHATSAPP.sh --solo-vincular
bash INSTALAR_SERVICIO.sh
bash CONTROLAR_SCALA.sh estado
```

El modo `--solo-vincular` guarda la sesión y sale sin responder a clientes. El servicio continuo comienza después de instalarlo. Ejecuta el instalador como tu usuario habitual; pedirá sudo cuando haga falta. Debe tener permisos de administrador para instalar el servicio.

## 3. Administración del servidor

Entra por SSH, abre la carpeta del bot y utiliza:

```bash
bash CONTROLAR_SCALA.sh estado
bash CONTROLAR_SCALA.sh logs
bash CONTROLAR_SCALA.sh reiniciar
bash CONTROLAR_SCALA.sh detener
bash CONTROLAR_SCALA.sh iniciar
bash DIAGNOSTICO_SCALA.sh
```

El diagnóstico muestra si hay una sesión guardada y marcas de conexión/respuesta anteriores. Una sesión guardada no demuestra que esté conectado ahora. Comprueba el estado del servicio y un mensaje entrante real.

Si WhatsApp cierra la sesión, el servicio se detiene para que puedas revisarlo. Para volver a vincular **en el servidor**:

```bash
bash CONTROLAR_SCALA.sh detener
bash INICIAR_SCALA_WHATSAPP.sh --solo-vincular --revincular
bash CONTROLAR_SCALA.sh iniciar
```

`--revincular` sustituye las credenciales locales de esta sesión; conserva el catálogo y las preferencias del bot. No elimina tu cuenta del celular. Revisa y elimina los dispositivos antiguos desde WhatsApp cuando corresponda. Un cierre abrupto del proceso puede requerir esperar 30 segundos antes de arrancar otra instancia.

## 4. Catálogo y atención

El catálogo inicial contiene **Gedeón, el valiente obediente**, cuento digital PDF basado en Jueces 6–7. El precio, pago y entrega deben confirmarse contigo: no se inventan. Para personalizarlo:

```bash
nano catalogo.json
bash DIAGNOSTICO_SCALA.sh
bash CONTROLAR_SCALA.sh reiniciar
```

Cada producto tiene `id`, `title`, `category`, `format`, `description`, `aliases`, `price`, `url` y `delivery`. Añade productos al arreglo `products`. Los IDs deben ser únicos, con letras minúsculas, números, guion o guion bajo.

Para precio confirmado, sustituye `null` en `price` por un objeto con tu monto real y moneda: `{"amount": TU_MONTO_NUMERICO, "currency": "BOB"}`. `TU_MONTO_NUMERICO` es una explicación, no un valor válido para pegar en JSON. Usa `paymentInstructions` para las instrucciones de pago autorizadas; `url` debe ser HTTPS. Conserva `null` para lo que todavía no esté confirmado.

El bot permite saludo, menú con opciones numéricas, catálogo paginado, fichas de productos, información del PDF y enlace de SCALA. Los clientes pueden escribir su consulta además de elegir números.

- `MENÚ`: vuelve al menú y reactiva las respuestas.
- `BAJA`: detiene respuestas automáticas hasta que el cliente las reactive.
- Atención humana, compra, datos pendientes, archivos y audios: el bot pausa 24 horas para que atiendas en ese mismo chat. No crea pedidos ni confirma pagos.
- Si respondes manualmente desde el celular y WhatsApp entrega ese evento al bot, se activa la pausa humana. No responde a sus propios mensajes.
- Ignora grupos, estados, canales, historial y mensajes antiguos. Solo atiende notificaciones nuevas de chats individuales.

La atención funciona por catálogo y reglas; no usa Gemini ni genera respuestas libres de IA. Esto permite comenzar sin ninguna API key. No se comparte contenido de clientes con un proveedor de IA.

## 5. Docker (alternativa)

Si tu servidor ya tiene Docker Compose, ejecuta allí:

```bash
docker compose build
docker compose run --rm -it bot node src/index.mjs --solo-vincular
docker compose up -d
docker compose logs -f
```

Para revincular:

```bash
docker compose down
docker compose run --rm -it bot node src/index.mjs --solo-vincular --revincular
docker compose up -d
```

El volumen `scala_session` conserva las credenciales. No ejecutes `down -v` si quieres mantener la sesión. El contenedor no expone puertos ni una página pública con el QR.

## Datos y límites

`data/scala.sqlite` conserva credenciales y claves Signal necesarias para el dispositivo, preferencias, pausas, bajas, cuotas y deduplicación. Las claves de sesión contienen datos privados; protege esta carpeta y nunca la subas a GitHub, compartas el QR ni entregues el archivo de la sesión. No guarda el texto, audio, imagen o nombre de los clientes para el catálogo. Los identificadores de chats y mensajes de esa lógica se guardan con HMAC; la autenticación de WhatsApp sí necesita sus propias claves e identificadores.

El servicio no abre puertos. Los logs de aplicación muestran eventos y horas, sin mensajes, teléfonos o claves. SQLite guarda credenciales y claves de sesión con serialización BufferJSON. Las respuestas salientes del catálogo se conservan hasta 24 horas para atender solicitudes de reenvío del propio protocolo de WhatsApp. Se conserva la respuesta del bot, no el texto recibido del cliente. Un bloqueo de instancia impide utilizar simultáneamente el mismo directorio de datos.

Límites predeterminados: 10 mensajes/minuto y 100/día por chat; 1000 mensajes/día globales. Deduplicación: ocho días. Se limpian preferencias ordinarias tras 30 días de inactividad; las bajas se conservan. Mensajes de más de cinco minutos y notificaciones de historial se ignoran para evitar responder en masa tras reconectar. Si un envío tiene resultado incierto, la lógica del bot no crea una segunda respuesta al repetirse la notificación; WhatsApp puede solicitar retransmisión del mensaje original con el mismo ID. No se garantiza entrega exactamente una vez ni que todas las notificaciones de WhatsApp lleguen al dispositivo.

## Validación y fuentes

```bash
bash PREPARAR_SCALA_MINT.sh
npm test
```

Las pruebas usan mensajes ficticios y no conectan un teléfono ni envían mensajes a WhatsApp. La instalación final requiere escanear el QR real y verificar la respuesta con otro número.

Se fija Baileys `7.0.0-rc14` y se incluye `package-lock.json` para mantener las dependencias revisadas. Es una versión candidata publicada por sus autores; futuras incompatibilidades necesitarán una actualización del proyecto.

Documentación de los autores:

- https://baileys.wiki/authentication/qr-code
- https://baileys.wiki/authentication/session-management
- https://github.com/WhiskeySockets/Baileys
- https://nodejs.org/en/download

Baileys y sus dependencias conservan sus propias licencias. La instalación incluye sus archivos de licencia.
