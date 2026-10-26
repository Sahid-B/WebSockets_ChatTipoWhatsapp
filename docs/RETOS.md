# Ubicación de los nueve retos

Los comentarios `// ------- Reto N: ... -------` identifican el código activo. Ruta del servidor: server.js → lab/connection.js → lab/router.js. Los módulos anteriores en server/socket y server/services no se utilizan.

| Reto | Servidor | Cliente | Cómo demostrar |
|---|---|---|---|
| 1. Está escribiendo | lab/realtime.js, lab/router.js, lab/connection.js | chat/realtimeClient.js | Escribir sin enviar en dos clientes; observar indicador y desaparición al detenerse/cambiar/desconectar |
| 2. Confirmaciones | lab/messages.js, lab/realtime.js, lab/router.js | chat/realtimeClient.js, chat/chatView.js | Enviar a cliente con otra conversación abierta: recibido; abrir y visualizar: leído; ver cantidades del grupo |
| 3. Reacciones | lab/realtime.js, lab/router.js | chat/chatController.js, chat/chatView.js | Pulsar 👍 ❤️ 😂; verificar cantidad y pulsar de nuevo para quitar |
| 4. Eliminar propios | lab/messages.js | chat/chatController.js | Eliminar propio; marcador en ambos clientes; ajenos rechazados por servidor |
| 5. Privados | lab/messages.js, lab/router.js | chat/chatController.js | Enviar entre dos usuarios; tercer cliente no recibe contenido ni eventos privados |
| 6. Salas | lab/router.js | chat/chatController.js | Crear/cambiar; usuarios de otra sala no reciben mensajes |
| 7. Última conexión | lab/users.js | chat/chatView.js | Cerrar un usuario; aparece la fecha/hora observada |
| 8. Reconexión | lab/users.js | transport/socketClient.js, chat/chatController.js | Detener/reiniciar; misma identidad/sala y borrador conservado |
| 9. Responder citando | lab/messages.js, lab/router.js | chat/chatController.js, chat/chatView.js | Responder; editar/eliminar original y observar cita actualizada |

Los tres primeros son eventos WebSocket funcionales, no efectos decorativos. Todos requieren pruebas externas reales para la demostración final del laboratorio. El túnel y el celular no se han probado todavía.
