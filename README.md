# SCALA WhatsApp · nube y Linux Mint

Bot de atención para productos de SCALA, vinculado con QR a WhatsApp Business. Incluye catálogo, menú, atención humana en el mismo chat, pausa cuando atiendes manualmente y preferencias persistentes.

**Para que siga funcionando con la PC apagada:** [configuración y vinculación en Railway](README_RAILWAY.md).

**Para usarlo en una PC encendida:** [instalación en Linux Mint](README_ES.md).

La sesión se guarda únicamente en un disco privado persistente. El bot no necesita una API key; las respuestas provienen del catálogo y reglas. El crédito disponible y la conexión con WhatsApp determinan si el servicio puede seguir atendiendo.

[Política de atención SCALA](POLITICA_ATENCION_SCALA.md): bienvenida, consultas, comprobantes, pagos autorizados, entrega y despedida. Un comprobante o texto del cliente nunca confirma un pago. Los datos pendientes se solicitan al equipo sin inventarlos.

`npm test` ejecuta las pruebas con datos ficticios. Consulta [VALIDACION.txt](VALIDACION.txt) para ver qué se comprobó y qué requiere un WhatsApp real.
