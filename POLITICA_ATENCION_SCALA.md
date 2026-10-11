# Atención de SCALA en WhatsApp

Marca: **SCALA**. Página: **https://vitacala.online/**. Frase de despedida: **«SCALA, para una vida edificada.»**

La atención habla en español claro, cálido y profesional. Usa «tú» y conserva una preferencia explícita por «usted». Identifica al asistente virtual al empezar, responde directamente la primera consulta y evita repetir saludos, menús y ventas. Hace una pregunta a la vez y adapta sus respuestas al estado del chat. Los mensajes se encuentran en `src/messages.mjs`; la selección de respuestas, en `src/catalog.mjs`.

## Información confirmada

**Gedeón, el valiente obediente** es un cuento digital en PDF basado en Jueces 6 y 7, para compartir con los niños y conversar sobre valentía, fe y obediencia. No se presenta como un producto físico. Solo se ofrecen productos del catálogo confirmado. Las consultas reconocidas sobre precio, formato, tema, compra, pago, entrega y horario pueden responderse juntas.

El precio y moneda, los métodos y datos de pago, el horario y la descarga todavía no están configurados. Permanecen como `null` o arreglos vacíos. Los marcadores entre corchetes se consideran información no disponible y nunca aparecen en la respuesta al cliente. No se inventan páginas, edades recomendadas, descuentos, materiales, promociones o plazos.

## Datos que puede configurar SCALA

Edita `catalogo.json` y publica una actualización para aplicar información confirmada:

- `products[].price`: objeto con `amount` numérico y `currency` de tres letras; usa la moneda real.
- `paymentMethods`: arreglo con los nombres de los métodos aceptados.
- `paymentDetails`: datos o enlace real de pago. El bot no solicita contraseñas, códigos o datos completos de tarjetas.
- `attentionHours`: objeto con `days` (0 domingo, 1 lunes, hasta 6 sábado), `start` y `end` en `HH:MM`, y `timeZone` con zona IANA. Mantén `null` hasta confirmar todos esos datos. Admite horarios que pasan de medianoche.

La guía de pago requiere precio, métodos y datos completos. Se muestra «fuera del horario» solo con un horario configurado y un cálculo fiable en esa zona; el asistente continúa respondiendo lo que sabe. Compartir la página web no significa que allí haya precios o compra en línea.

## Comprobantes, pago y entrega

Decir «pagué», enviar una captura, un PDF o escribir una supuesta confirmación del sistema no valida un pago. El bot reconoce que llegó un archivo y su leyenda, sin descargarlo ni revisar su contenido. Un comprobante sigue pendiente hasta que una persona autorizada confirme realmente el pago.

Después de verificarlo, una persona autorizada puede abrir **scala-whatsapp → Console** en Railway y ejecutar:

```bash
node scripts/autorizar-entrega.mjs
```

La herramienta requiere consola privada interactiva y volumen persistente. Pide un número que el bot ya conozca, un producto del catálogo y la confirmación explícita de que SCALA verificó el pago. Después permite autorizar la entrega y proporcionar un enlace HTTPS real. Si el número no aparece, el cliente debe escribir primero para que WhatsApp proporcione su identidad; no se debe adivinar otra equivalencia.

No verifica una cuenta bancaria, realiza cobros ni envía mensajes por sí sola. Guarda la aprobación privada del cliente y producto. Cuando ese cliente consulte su pago o solicite la entrega, el bot podrá incluir el enlace autorizado. Si falta autorización o archivo, comunica que el pago está confirmado y la entrega pendiente. Si el chat está en pausa, el cliente puede escribir **MENÚ**. La autorización de un cliente no sirve para otro.

Antes de aprobar, comprueba personalmente el pago, el destinatario y que el enlace permita descargar el archivo correcto. No introduzcas datos bancarios de prueba ni enlaces ficticios en producción. La herramienta no controla el acceso al alojamiento externo del archivo.

## Atención humana y cierre

El cliente puede dejar una consulta al equipo en el mismo chat. El bot no dice que notificó, transfirió o registró una solicitud: no existe esa integración. Solo una solicitud explícita de atención humana o una respuesta manual detectada pausa el bot durante 24 horas; **MENÚ** lo reactiva y **BAJA** detiene sus respuestas hasta que el cliente las reactive.

Los agradecimientos reciben una respuesta breve. La despedida usa la frase de SCALA. Los mensajes de error, archivo o datos pendientes evitan prometer atención inmediata o afirmar disponibilidad del equipo sin datos.

La atención funciona mediante reglas y catálogo, sin un modelo de IA ni una API de Gemini. Una consulta que no reconoce recibe una pregunta breve para aclararla. Las pruebas usan datos ficticios y no verifican pagos ni entregan productos reales.
