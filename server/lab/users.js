import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { db, transaction } from './repository.js';

export const online = new Map();
export function requireUser(ws) {
  if (!ws.userId || online.get(ws.userId) !== ws) throw new Error('NOT_IDENTIFIED');
  return db.users.find(u => u.id === ws.userId);
}
export function validText(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error('INVALID_PAYLOAD');
  return value.trim();
}
const hash = token => createHash('sha256').update(token).digest('hex');
// ------- Reto 8: Reconexión con token opaco, hash persistido y misma identidad -------
export function join(ws, payload) {
  if (ws.userId) throw new Error('ALREADY_JOINED');
  let user, token = payload.sessionToken;
  if (token !== undefined && token !== null) {
    if (typeof token !== 'string' || token.length > 256) throw new Error('SESSION_INVALID');
    const session = db.sessions.find(s => s.hash === hash(token) && s.expiresAt > Date.now());
    user = session && db.users.find(u => u.id === session.userId);
    if (!user) throw new Error('SESSION_INVALID');
    if (online.has(user.id)) throw new Error('SESSION_IN_USE');
  } else {
    const name = validText(payload.name, 24);
    token = randomBytes(32).toString('hex');
    user = { id: randomUUID(), name, createdAt: Date.now(), lastDisconnectedAt: null, lastRoomId: 'room:general' };
    transaction(() => {
      db.users.push(user);
      db.sessions.push({ hash: hash(token), userId: user.id, expiresAt: Date.now() + 7 * 86400000 });
    });
  }
  ws.userId = user.id;
  ws.roomId = db.rooms.some(r => r.id === user.lastRoomId) ? user.lastRoomId : 'room:general';
  online.set(user.id, ws);
  return { user: publicUser(user), sessionToken: token, room: db.rooms.find(r => r.id === ws.roomId) };
}
export function publicUser(user) {
  // ------- Reto 7: Última conexión observada y presencia real -------
  const connection = online.get(user.id);
  return { id: user.id, name: user.name, joinedAt: user.createdAt, lastDisconnectedAt: user.lastDisconnectedAt, online: !!connection, roomId: connection?.roomId || null };
}
export function usersList() { return db.users.map(publicUser); }
export function disconnect(ws) {
  // ------- Reto 7: Guardar fecha al cerrarse la conexión -------
  if (!ws.userId || online.get(ws.userId) !== ws) return null;
  const user = db.users.find(u => u.id === ws.userId);
  try { transaction(() => { user.lastDisconnectedAt = Date.now(); user.lastRoomId = ws.roomId; }); }
  finally { online.delete(ws.userId); }
  return user;
}
