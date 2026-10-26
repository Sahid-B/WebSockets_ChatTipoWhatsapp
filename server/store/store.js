import { loadJSON, saveJSON } from '../utils/storage.js';

const state = {
  usersKnown: new Map(), // userId -> { id, name, createdAt, lastDisconnectedAt }
  sessions: new Map(), // token -> { userId, createdAt, expiresAt }
  rooms: new Map(), // roomId -> { id, name, createdAt, createdBy, isDefault }
  messages: [], // all messages
  receipts: new Map() // messageId -> { receivedBy: Set, readBy: Set }
};

function init() {
  // Load persisted data
  const usersKnown = loadJSON('usersKnown.json', []);
  for (const u of usersKnown) {
    state.usersKnown.set(u.id, u);
  }
  
  const rooms = loadJSON('rooms.json', []);
  for (const r of rooms) {
    state.rooms.set(r.id, r);
  }
  
  if (state.rooms.size === 0) {
    const general = { id: 'room:general', name: 'General', createdAt: Date.now(), createdBy: 'system', isDefault: true };
    state.rooms.set(general.id, general);
    saveRooms();
  }
  
  const messages = loadJSON('messages.json', []);
  state.messages = messages;
  
  const receipts = loadJSON('receipts.json', {});
  for (const [msgId, rec] of Object.entries(receipts)) {
    state.receipts.set(msgId, {
      receivedBy: new Set(rec.receivedBy || []),
      readBy: new Set(rec.readBy || [])
    });
  }
}

function saveUsersKnown() {
  saveJSON('usersKnown.json', Array.from(state.usersKnown.values()));
}

function saveRooms() {
  saveJSON('rooms.json', Array.from(state.rooms.values()));
}

function saveMessages() {
  // Limit history
  const toSave = state.messages.slice(-1000);
  saveJSON('messages.json', toSave);
}

function saveReceipts() {
  const obj = {};
  for (const [msgId, rec] of state.receipts.entries()) {
    obj[msgId] = {
      receivedBy: Array.from(rec.receivedBy),
      readBy: Array.from(rec.readBy)
    };
  }
  saveJSON('receipts.json', obj);
}

export const store = {
  state,
  init,
  saveUsersKnown,
  saveRooms,
  saveMessages,
  saveReceipts
};

init();