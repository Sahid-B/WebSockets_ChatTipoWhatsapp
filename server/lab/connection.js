import { randomUUID } from 'node:crypto';
import { parseMessage, send } from '../protocol.js';
import { disconnect } from './users.js';
import { broadcast, presence, route } from './router.js';
import { stopTyping } from './realtime.js';
const descriptions = {
  NOT_IDENTIFIED: 'Ingresa o recupera tu sesión.', INVALID_PAYLOAD: 'Revisa los datos y sus límites.',
  SESSION_INVALID: 'La sesión venció o no existe. Ingresa nuevamente.', SESSION_IN_USE: 'Esta sesión ya está abierta en otro cliente.',
  ALREADY_JOINED: 'Ya ingresaste.', INVALID_RECIPIENT: 'Destinatario inválido.', TARGET_OFFLINE: 'El destinatario está desconectado.',
  FORBIDDEN: 'No tienes permiso para esta operación.', NOT_FOUND: 'El mensaje ya no está disponible.',
  DELETED: 'El mensaje fue eliminado.', INVALID_REPLY: 'La cita debe pertenecer a esta conversación.',
  ROOM_EXISTS: 'Ya existe una sala con ese nombre.', ROOM_NOT_FOUND: 'La sala no existe.',
  NOT_RECIPIENT: 'No eres destinatario de este mensaje.', INVALID_EMOJI: 'Reacción no permitida.',
  DUPLICATE_CONFLICT: 'El identificador de envío ya se utilizó con otro contenido.',
  NOT_IMPLEMENTED: 'Esta función queda pendiente.', UNKNOWN_EVENT: 'Evento desconocido.'
};
export function attachConnections(wss) {
  wss.on('connection', ws => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    send(ws, { type: 'session:welcome', payload: { connectionId: randomUUID(), protocolVersion: 2 } });
    ws.on('message', (raw, binary) => {
      const message = !binary && parseMessage(raw);
      if (!message) return send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Se requiere un evento JSON válido.' });
      try { route(ws, message); }
      catch (error) {
        const known = Object.hasOwn(descriptions, error.message);
        if (!known) console.error('Error del servidor:', error);
        send(ws, { type: 'error', requestId: message.requestId, code: known ? error.message : 'SERVER_ERROR', message: known ? descriptions[error.message] : 'No se pudo guardar o procesar la operación.' });
      }
    });
    ws.on('close', () => {
      // ------- Reto 1: Retirar indicador al desconectarse -------
      stopTyping(ws);
      try { const user = disconnect(ws); if (user) { broadcast('user:left', { id: user.id, name: user.name, lastDisconnectedAt: user.lastDisconnectedAt }); presence(); } }
      catch (error) { console.error('No se pudo guardar la desconexión:', error); presence(); }
    });
    ws.on('error', () => {});
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
}
