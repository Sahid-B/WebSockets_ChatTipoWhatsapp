import { db, transaction } from './repository.js';
import { online, requireUser } from './users.js';
import { getMessage } from './messages.js';
import { send } from '../protocol.js';

// ------- Reto 1: Está escribiendo (aislamiento y expiración en servidor) -------
const writers = new Map();
function notifyTyping(entry, active) {
  for (const ws of online.values()) {
    if (ws.userId === entry.userId) continue;
    const allowed = entry.conversationType === 'private' ? entry.participants.includes(ws.userId) : ws.roomId === entry.roomId;
    if (allowed) send(ws, { type: active ? 'typing:start' : 'typing:stop', payload: { ...entry, timer: undefined } });
  }
}
export function stopTyping(ws) {
  const entry = writers.get(ws.userId);
  if (!entry) return;
  clearTimeout(entry.timer); writers.delete(ws.userId); notifyTyping(entry, false);
}
export function handleTyping(ws, payload, active) {
  const user = requireUser(ws);
  if (!active) return stopTyping(ws);
  if (!['room', 'private'].includes(payload.conversationType)) throw new Error('INVALID_PAYLOAD');
  const privateChat = payload.conversationType === 'private';
  if (privateChat && (typeof payload.otherId !== 'string' || payload.otherId === user.id)) throw new Error('INVALID_RECIPIENT');
  if (privateChat && !online.has(payload.otherId)) throw new Error('TARGET_OFFLINE');
  const key = privateChat ? ['private', ...[user.id, payload.otherId].sort()].join(':') : 'room:' + ws.roomId;
  const previous = writers.get(user.id);
  if (previous && previous.key !== key) stopTyping(ws);
  const existing = writers.get(user.id);
  const entry = { userId: user.id, userName: user.name, key, conversationType: payload.conversationType,
    roomId: privateChat ? null : ws.roomId, participants: privateChat ? [user.id, payload.otherId] : null,
    lastNotification: existing?.lastNotification || 0 };
  clearTimeout(existing?.timer);
  if (Date.now() - entry.lastNotification >= 700) {
    entry.lastNotification = Date.now(); notifyTyping(entry, true);
  }
  entry.timer = setTimeout(() => stopTyping(ws), 2800);
  entry.timer.unref(); writers.set(user.id, entry);
}

// ------- Reto 2: Confirmación de recepción/lectura (confirmaciones reales) -------
export function markReceipt(ws, payload) {
  const message = getMessage(ws, payload.messageId);
  if (!['received', 'read'].includes(payload.receiptType)) throw new Error('INVALID_PAYLOAD');
  if (!message.delivery?.expected.includes(ws.userId) || message.authorId === ws.userId) throw new Error('NOT_RECIPIENT');
  if (message.deleted) throw new Error('DELETED');
  const delivery = message.delivery;
  if ((payload.receiptType === 'read' ? delivery.readBy : delivery.receivedBy).includes(ws.userId)) return { message, changed: false };
  transaction(() => {
    if (!delivery.receivedBy.includes(ws.userId)) delivery.receivedBy.push(ws.userId);
    if (payload.receiptType === 'read' && !delivery.readBy.includes(ws.userId)) delivery.readBy.push(ws.userId);
  });
  return { message, changed: true };
}

// ------- Reto 3: Reacciones (alternar sin duplicar usuario y emoji) -------
export const EMOJIS = ['👍', '❤️', '😂'];
export function toggleReaction(ws, payload) {
  const message = getMessage(ws, payload.messageId);
  if (!EMOJIS.includes(payload.emoji)) throw new Error('INVALID_EMOJI');
  if (message.deleted) throw new Error('DELETED');
  transaction(() => {
    message.reactions ||= {};
    const users = Array.isArray(message.reactions[payload.emoji]) ? message.reactions[payload.emoji] : [];
    message.reactions[payload.emoji] = users.includes(ws.userId) ? users.filter(id => id !== ws.userId) : [...users, ws.userId];
    if (!message.reactions[payload.emoji].length) delete message.reactions[payload.emoji];
  });
  return message;
}
