# Protocolo activo (versión 2)

Todos los mensajes son JSON `{type, requestId?, payload}`. Los errores son `{type:"error", requestId?, code, message}`. El servidor deriva la identidad de la conexión, nunca de un authorId del cliente.

| Cliente → servidor | Payload | Respuesta / difusión |
|---|---|---|
| session:join | `{name}` o `{sessionToken}` | session:joined `{user,sessionToken,room}`, rooms:list, history:room, users:list |
| users:list | `{}` | users:list `{users,count}` (usuarios conocidos; cada uno indica online y roomId; count es global) |
| rooms:list | `{}` | rooms:list `{rooms}` |
| room:create | `{name}` | room:created `{room}`, rooms:list a identificados |
| room:join | `{roomId}` | room:joined `{room}`, history:room, users:list |
| history:room | `{}` | history:room `{roomId,messages}` solo de la sala actual |
| private:history | `{otherId}` | history:private `{otherId,messages}` solo de ambos participantes |
| private:list | `{}` | private:list `{conversations}` propias |
| message:new | `{content,clientMessageId,replyToId?}` | message:new a sala, message:ack al emisor |
| message:private | `{recipientId,content,clientMessageId,replyToId?}` | message:private a ambos, message:ack al emisor |
| message:edit | `{messageId,content}` | message:edit a destinatarios autorizados |
| message:delete | `{messageId}` | message:delete a destinatarios autorizados |

`clientMessageId` es obligatorio. Un reintento idéntico devuelve el mismo mensaje sin difusión duplicada. Reutilizarlo con distinto contenido produce DUPLICATE_CONFLICT. El cliente conserva el borrador hasta message:ack y no reenvía automáticamente al reconectar.

Los mensajes tienen id, authorId, authorName, createdAt, editedAt, deleted, type, roomId o participants/conversationId. Las citas se resuelven desde el original: editar/eliminar actualiza también las citas ya visibles. No se puede citar entre conversaciones.

Todos ingresan por primera vez a General. Un usuario pertenece a una sala activa; los privados son independientes de ella. El historial de sala es accesible a miembros actuales. Cada sesión admite una conexión activa: SESSION_IN_USE evita identidades duplicadas. El token solo se entrega al titular; se mantiene por pestaña en sessionStorage y como perfil recuperable en localStorage; en disco se conserva su hash, con vencimiento de siete días.

Otros eventos: session:welcome al conectar, user:joined/user:left a identificados.

## Retos 1, 2 y 3

| Cliente → servidor | Payload | Resultado |
|---|---|---|
| typing:start | `{conversationType:"room"}` o `{conversationType:"private",otherId}` | typing:start a los otros participantes; expira a los 2,8 segundos sin renovación |
| typing:stop | `{}` | typing:stop del contexto que el servidor registró para el emisor |
| receipt:mark | `{messageId,receiptType:"received" o "read"}` | receipt:update con el mensaje completo a autorizados; receipt:ack directo |
| reaction:add | `{messageId,emoji}` | reaction:update con el mensaje completo a autorizados; reaction:ack directo |

El servidor limita las notificaciones de escritura a una cada 700ms por usuario, cancela al enviar/cambiar sala/desconectarse y valida el destinatario privado. Cada cliente también retira indicadores expirados.

Cada mensaje nuevo tiene `delivery:{expected,receivedBy,readBy}` con arrays de IDs. expected es la instantánea de destinatarios conectados al enviar (privado: otro usuario; sala: otros miembros conectados). Solo esos usuarios pueden confirmar, con acceso vigente a la conversación. Las confirmaciones son idempotentes y read implica received. received indica confirmación del cliente, no únicamente que ws.send terminó; read indica confirmación de visualización del navegador y no acredita comprensión humana. El autor no se cuenta.

`reactions` es un objeto emoji → array de IDs. Solo 👍 ❤️ 😂. Cada acción alterna la reacción propia; no hay duplicados. Ambos campos son persistentes y aparecen en el historial. El contenido, las reacciones y las confirmaciones de un privado nunca se difunden a terceros.

