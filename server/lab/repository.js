import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.env.CHAT_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
const file = path.join(directory, 'chat-state.json');
fs.mkdirSync(directory, { recursive: true });
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function initialState() {
  const users = load('usersKnown.json', []).map(u => ({ ...u, lastRoomId: 'room:general' }));
  const rooms = load('rooms.json', []);
  const messages = load('messages.json', []).map(m => ({ ...m, reactions: m.reactions || {} }));
  return { version: 1, users, rooms, messages, sessions: [], dedup: [] };
}
export const db = load('chat-state.json', null) || initialState();
for (const key of ['users', 'rooms', 'messages', 'sessions', 'dedup']) {
  if (!Array.isArray(db[key])) throw new Error('Formato de almacenamiento inválido: ' + key);
}
if (!db.rooms.some(r => r.id === 'room:general')) {
  db.rooms.unshift({ id: 'room:general', name: 'General', createdAt: Date.now(), isDefault: true });
}

// Synchronous, serialized writes: rename replaces the entire snapshot atomically.
// On a failed write restore memory so clients never observe uncommitted changes.
export function transaction(change) {
  const before = structuredClone(db);
  const temporary = file + '.tmp';
  try {
    const result = change();
    db.messages = db.messages.slice(-1000);
    db.dedup = db.dedup.filter(d => db.messages.some(m => m.id === d.messageId)).slice(-1000);
    db.sessions = db.sessions.filter(s => s.expiresAt > Date.now());
    fs.writeFileSync(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
    return result;
  } catch (error) {
    Object.assign(db, before);
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}
