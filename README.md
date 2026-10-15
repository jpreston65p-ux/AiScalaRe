# SCALA AI

Chat público: https://jpreston65p-ux.github.io/AiScalaRe/

La página usa el servidor de SCALA AI en https://scala-ai-publico.thatfixnova.chatgpt.site. Los visitantes pueden conversar desde PC y móviles sin instalar programas, introducir claves ni dejar encendida la PC del administrador.

## Estado y activación

La conexión está integrada. Para recibir respuestas reales, el administrador debe guardar una clave válida de Google Gemini como secreto `GEMINI_API_KEY` en el servidor y volver a desplegarlo. Mientras no esté configurada, la interfaz avisa que SCALA AI se está preparando y mantiene desactivado el envío. No genera respuestas simuladas.

GitHub Pages sirve el HTML, los estilos, los scripts y las fuentes del chat. Las imágenes WebP optimizadas se cargan desde los recursos públicos del servidor. Las peticiones usan `/api/status`, `/api/chat` y `/api/cancel`, sesión temporal firmada y CORS para `https://jpreston65p-ux.github.io`. La clave de Gemini no se guarda en este repositorio ni en el navegador.

## Funciones

- Modos Rápido y Avanzado con Gemini.
- Respuestas progresivas, detener, reintentar y continuar.
- Historial, búsqueda, biblioteca e importación/exportación por navegador.
- Las conversaciones del historial se conservan solo durante el día local del dispositivo. Se borran al cambiar de día mientras la página está abierta, o antes de mostrarse al volver a abrirla. Las copias importadas también deben ser de hoy. La biblioteca de respuestas guardadas manualmente conserva su comportamiento independiente.
- Preferencias de lectura e instrucciones personales.
- Adjuntar texto, copiar respuestas y mostrar Markdown seguro.

## Comprobación

Ejecuta `node --test tests/github-pages.test.cjs`. Las pruebas del cliente usan respuestas de servicio controladas; no consumen la cuota de Gemini ni sustituyen una conversación real. Las pruebas del servidor se mantienen en su proyecto. La versión pública completa debe comprobarse de nuevo después de añadir la clave de Gemini.
