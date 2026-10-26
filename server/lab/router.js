import { randomUUID } from 'node:crypto';
import { db, transaction } from './repository.js';
import { online, requireUser, join, usersList, validText } from './users.js';
import { history, createMessage, modifyMessage, serialize, canAccess } from './messages.js';
import { send } from '../protocol.js';
import { handleTyping, stopTyping, markReceipt, toggleReaction } from './realtime.js';

export function broadcast(type, payload) { for (const ws of online.values()) send(ws, { type, payload }); }
export function presence() { broadcast('users:list', { users: usersList(), count: online.size }); }
function publish(type, message) {
  for (const ws of online.values()) if (canAccess(ws, message)) send(ws, { type, payload: serialize(message) });
}
function sendHistory(ws, otherId, requestId) { send(ws, { type: otherId ? 'history:private' : 'history:room', requestId, payload: { roomId: ws.roomId, otherId, messages: history(ws, otherId) } }); }
export function route(ws, event) {
  const { type, requestId } = event;
  const payload = event.payload || {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_PAYLOAD');
  if (type === 'session:join') {
    const result = join(ws, payload);
    send(ws, { type: 'session:joined', requestId, payload: result });
    send(ws, { type: 'rooms:list', payload: { rooms: db.rooms } });
    sendHistory(ws);
    broadcast('user:joined', { id: result.user.id, name: result.user.name });
    presence();
    return;
  }
  const user = requireUser(ws);
  if (type === 'users:list') return presence();
  if (type === 'rooms:list') return send(ws, { type, requestId, payload: { rooms: db.rooms } });
  if (type === 'room:create') {
    // ------- Reto 6: Salas de chat (crear, listar, cambiar y aislar) -------
    const name = validText(payload.name, 32);
    if (db.rooms.some(r => r.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('ROOM_EXISTS');
    const room = { id: 'room:' + randomUUID(), name, createdAt: Date.now(), createdBy: user.id };
    transaction(() => db.rooms.push(room));
    broadcast('rooms:list', { rooms: db.rooms });
    return send(ws, { type: 'room:created', requestId, payload: { room } });
  }
  if (type === 'room:join') {
    const room = db.rooms.find(r => r.id === payload.roomId);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    stopTyping(ws);
    transaction(() => { user.lastRoomId = room.id; });
    ws.roomId = room.id;
    send(ws, { type: 'room:joined', requestId, payload: { room } });
    sendHistory(ws);
    return presence();
  }
  if (type === 'history:room') return sendHistory(ws, null, requestId);
  if (type === 'private:history') {
    // ------- Reto 5: Historial privado limitado a sus dos participantes -------
    if (typeof payload.otherId !== 'string' || payload.otherId === user.id || !db.users.some(u => u.id === payload.otherId)) throw new Error('INVALID_RECIPIENT');
    return sendHistory(ws, payload.otherId, requestId);
  }
  if (type === 'private:list') {
    const others = [...new Set(db.messages.filter(m => m.type === 'private' && m.participants.includes(user.id)).flatMap(m => m.participants).filter(id => id !== user.id))];
    return send(ws, { type, requestId, payload: { conversations: others.map(id => ({ otherId: id, name: db.users.find(u => u.id === id)?.name })) } });
  }
  if (type === 'message:new' || type === 'message:private') {
    const { message, duplicate } = createMessage(ws, payload, type === 'message:private');
    stopTyping(ws);
    if (!duplicate) publish(type, message);
    return send(ws, { type: 'message:ack', requestId, payload: { message: serialize(message), duplicate } });
  }
  if (type === 'message:edit' || type === 'message:delete') {
    const message = modifyMessage(ws, payload, type === 'message:delete');
    publish(type, message);
    // Refresh already-rendered quotes without leaking originals across conversations.
    for (const reply of db.messages.filter(m => m.replyToId === message.id)) publish('message:edit', reply);
    return;
  }
  // ------- Reto 1: Eventos de escritura y parada -------
  if (type === 'typing:start' || type === 'typing:stop') return handleTyping(ws, payload, type === 'typing:start');
  // ------- Reto 2: Actualizar estado solo después de la confirmación del receptor -------
  if (type === 'receipt:mark') {
    const result = markReceipt(ws, payload);
    if (result.changed) publish('receipt:update', result.message);
    return send(ws, { type: 'receipt:ack', requestId, payload: { messageId: result.message.id } });
  }
  // ------- Reto 3: Difundir reacciones únicamente a la conversación autorizada -------
  if (type === 'reaction:add') {
    const message = toggleReaction(ws, payload);
    publish('reaction:update', message);
    return send(ws, { type: 'reaction:ack', requestId, payload: { messageId: message.id } });
  }
  throw new Error('UNKNOWN_EVENT');
}
