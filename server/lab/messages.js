import { randomUUID } from 'node:crypto';
import { db, transaction } from './repository.js';
import { online, requireUser, validText } from './users.js';

export function canAccess(ws, message) {
  return !!message && (message.type === 'private' ? message.participants.includes(ws.userId) : message.roomId === ws.roomId);
}
// ------- Reto 9: Respuestas citadas (resolver siempre el original vigente) -------
export function serialize(message) {
  const original = message.replyToId && db.messages.find(m => m.id === message.replyToId);
  const same = original && original.type === message.type && (message.type === 'room' ? original.roomId === message.roomId : original.conversationId === message.conversationId);
  return { ...message, reactions: message.deleted ? {} : message.reactions || {}, content: message.deleted ? '' : message.content,
    reply: message.replyToId ? (same ? { id: original.id, authorName: original.authorName, content: original.deleted ? 'Mensaje eliminado' : original.content.slice(0, 180), deleted: original.deleted } : { id: message.replyToId, content: 'Mensaje no disponible' }) : null };
}
export function getMessage(ws, id) {
  requireUser(ws);
  const message = db.messages.find(m => m.id === id);
  if (!message) throw new Error('NOT_FOUND');
  if (!canAccess(ws, message)) throw new Error('FORBIDDEN');
  return message;
}
export function history(ws, otherId) {
  requireUser(ws);
  return db.messages.filter(m => otherId ? m.type === 'private' && m.participants.includes(ws.userId) && m.participants.includes(otherId) : m.type === 'room' && m.roomId === ws.roomId).slice(-100).map(serialize);
}
export function createMessage(ws, payload, privateMessage) {
  const author = requireUser(ws);
  const content = validText(payload.content, 1000);
  const clientMessageId = payload.clientMessageId;
  if (typeof clientMessageId !== 'string' || clientMessageId.length > 100 || !clientMessageId) throw new Error('INVALID_PAYLOAD');
  if (privateMessage && (typeof payload.recipientId !== 'string' || payload.recipientId === author.id)) throw new Error('INVALID_RECIPIENT');
  const target = privateMessage ? payload.recipientId : ws.roomId;
  const duplicate = db.dedup.find(d => d.userId === author.id && d.clientMessageId === clientMessageId);
  if (duplicate) {
    if (duplicate.target !== target || duplicate.privateMessage !== privateMessage || duplicate.content !== content || duplicate.replyToId !== (payload.replyToId || null)) throw new Error('DUPLICATE_CONFLICT');
    return { message: getMessage(ws, duplicate.messageId), duplicate: true };
  }
  // ------- Reto 5: Mensajes privados (destinatario y participantes autorizados) -------
  if (privateMessage && !online.has(payload.recipientId)) throw new Error('TARGET_OFFLINE');
  const participants = privateMessage ? [author.id, payload.recipientId].sort() : null;
  const message = { id: randomUUID(), clientMessageId, type: privateMessage ? 'private' : 'room', roomId: privateMessage ? null : ws.roomId,
    participants, conversationId: participants?.join(':'), authorId: author.id, authorName: author.name, content, createdAt: Date.now(), editedAt: null, deleted: false,
    replyToId: payload.replyToId || null, reactions: {},
    // ------- Reto 2: Destinatarios esperados al momento del envío -------
    delivery: { expected: privateMessage ? [payload.recipientId] : [...online.values()].filter(client => client.userId !== author.id && client.roomId === ws.roomId).map(client => client.userId), receivedBy: [], readBy: [] } };
  if (message.replyToId) {
    const original = getMessage(ws, message.replyToId);
    if (original.type !== message.type || (privateMessage ? original.conversationId !== message.conversationId : original.roomId !== message.roomId)) throw new Error('INVALID_REPLY');
  }
  transaction(() => {
    db.messages.push(message);
    db.dedup.push({ userId: author.id, clientMessageId, messageId: message.id, target, privateMessage, content, replyToId: message.replyToId });
  });
  return { message, duplicate: false };
}
export function modifyMessage(ws, payload, remove) {
  // ------- Reto 4: Eliminar mensajes propios (autoría validada en servidor) -------
  const message = getMessage(ws, payload.messageId);
  if (message.authorId !== ws.userId) throw new Error('FORBIDDEN');
  if (message.deleted) throw new Error('DELETED');
  const content = remove ? '' : validText(payload.content, 1000);
  transaction(() => {
    message.content = content; message.deleted = remove;
    if (remove) {
      message.reactions = {};
      for (const entry of db.dedup.filter(d => d.messageId === message.id)) entry.content = '';
    } else message.editedAt = Date.now();
  });
  return message;
}
