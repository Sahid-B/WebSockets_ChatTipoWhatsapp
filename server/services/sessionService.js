import { randomUUID } from 'node:crypto';
import { store } from '../store/store.js';

const sessions = store.state.sessions;
const usersKnown = store.state.usersKnown;

export function createSession(userId) {
  const token = randomUUID() + '.' + randomUUID();
  const session = {
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  sessions.set(token, session);
  return token;
}

export function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function revokeSession(token) {
  if (token) sessions.delete(token);
}

export function registerKnownUser(user) {
  if (!usersKnown.has(user.id)) {
    usersKnown.set(user.id, {
      id: user.id,
      name: user.name,
      createdAt: Date.now(),
      lastDisconnectedAt: null
    });
    store.saveUsersKnown();
  } else {
    const known = usersKnown.get(user.id);
    known.name = user.name;
    store.saveUsersKnown();
  }
}

export function updateLastDisconnect(userId) {
  const known = usersKnown.get(userId);
  if (known) {
    known.lastDisconnectedAt = Date.now();
    store.saveUsersKnown();
  }
}

export function getKnownUser(userId) {
  return usersKnown.get(userId) || null;
}

export function getAllKnownUsers() {
  return Array.from(usersKnown.values());
}

export default {
  createSession,
  validateSession,
  revokeSession,
  registerKnownUser,
  updateLastDisconnect,
  getKnownUser,
  getAllKnownUsers
};