import { randomUUID } from 'node:crypto';
import { MAX_MESSAGE_LENGTH } from '../config.js';
import { store } from '../store/store.js';
import roomService from './roomService.js';

const messages = store.state.messages;
const receipts = store.state.receipts;
const MAX_HISTORY = 1000;

// Private conversations: key is sorted userIds
const privateConvs = new Map(); // 'userId1:userId2' -> { participants: Set, messages: [] }

function getConvKey(userId1, userId2) {
  const sorted = [userId1, userId2].sort();
  return sorted.join(':');
}

function sanitize(text) {
  if (typeof text !== 'string') return '';
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

export function createRoomMessage(author, content, roomId, replyToId = null) {
  const msg = {
    id: randomUUID(),
    type: 'room',
    roomId,
    authorId: author.id,
    authorName: author.name,
    content: sanitize(content),
    createdAt: Date.now(),
    editedAt: null,
    deleted: false,
    replyToId: replyToId ?? null,
    reactions: {}, // emoji -> Set of userIds
  };
  messages.push(msg);
  if (messages.length > MAX_HISTORY) {
    messages.shift();
  }
  store.saveMessages();
  
  // Initialize receipts - recipients are room members except author
  receipts.set(msg.id, {
    receivedBy: new Set(),
    readBy: new Set()
  });
  
  return msg;
}

export function createPrivateMessage(author, content, recipientId, replyToId = null) {
  if (author.id === recipientId) return { ok: false, code: 'INVALID_RECIPIENT' };
  const key = getConvKey(author.id, recipientId);
  if (!privateConvs.has(key)) {
    privateConvs.set(key, { participants: new Set([author.id, recipientId]), messages: [] });
  }
  
  const msg = {
    id: randomUUID(),
    type: 'private',
    conversationId: key,
    participants: [author.id, recipientId],
    authorId: author.id,
    authorName: author.name,
    recipientId,
    content: sanitize(content),
    createdAt: Date.now(),
    editedAt: null,
    deleted: false,
    replyToId: replyToId ?? null,
    reactions: {},
  };
  messages.push(msg);
  privateConvs.get(key).messages.push(msg.id);
  if (messages.length > MAX_HISTORY) {
    messages.shift();
  }
  store.saveMessages();
  
  receipts.set(msg.id, {
    receivedBy: new Set(),
    readBy: new Set()
  });
  
  return { ok: true, message: msg };
}

export function getMessage(messageId) {
  return messages.find(m => m.id === messageId) || null;
}

export function editMessage(messageId, author, content) {
  const msg = messages.find(m => m.id === messageId);
  if (!msg) return { ok: false, code: 'NOT_FOUND' };
  if (msg.authorId !== author.id) return { ok: false, code: 'FORBIDDEN' };
  if (msg.deleted) return { ok: false, code: 'DELETED' };
  msg.content = sanitize(content);
  msg.editedAt = Date.now();
  store.saveMessages();
  return { ok: true, message: { ...msg, reactions: msg.reactions } };
}

export function removeMessage(messageId, author) {
  const msg = messages.find(m => m.id === messageId);
  if (!msg) return { ok: false, code: 'NOT_FOUND' };
  if (msg.authorId !== author.id) return { ok: false, code: 'FORBIDDEN' };
  msg.deleted = true;
  msg.content = '';
  store.saveMessages();
  return { ok: true, message: { id: msg.id, deleted: true, type: msg.type, roomId: msg.roomId, conversationId: msg.conversationId } };
}

export function addReaction(messageId, userId, emoji) {
  const msg = messages.find(m => m.id === messageId);
  if (!msg) return { ok: false, code: 'NOT_FOUND' };
  if (msg.deleted) return { ok: false, code: 'DELETED' };
  
  // Check access
  if (msg.type === 'private') {
    if (!msg.participants.includes(userId)) return { ok: false, code: 'FORBIDDEN' };
  } else if (msg.type === 'room') {
    // Check if user is in same room? For simplicity, allow if they're a member
    const userRoomId = roomService.getUserRoom(userId).id;
    if (userRoomId !== msg.roomId) return { ok: false, code: 'FORBIDDEN' };
  }
  
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = new Set();
  
  // If user already reacted with this emoji, remove it (toggle)
  if (msg.reactions[emoji].has(userId)) {
    msg.reactions[emoji].delete(userId);
    if (msg.reactions[emoji].size === 0) {
      delete msg.reactions[emoji];
    }
    store.saveMessages();
    return { ok: true, message: serializeMessage(msg), toggled: 'removed' };
  }
  
  // Add reaction
  msg.reactions[emoji].add(userId);
  store.saveMessages();
  return { ok: true, message: serializeMessage(msg), toggled: 'added' };
}

function serializeMessage(msg) {
  const reactions = {};
  if (msg.reactions) {
    for (const [emoji, set] of Object.entries(msg.reactions)) {
      reactions[emoji] = Array.from(set);
    }
  }
  return { ...msg, reactions };
}

export function markReceived(messageId, userId) {
  const msg = getMessage(messageId);
  if (!msg) return { ok: false };
  if (msg.authorId === userId) return { ok: false }; // author doesn't count
  if (msg.deleted) return { ok: false };
  
  // Check access
  if (msg.type === 'private') {
    if (!msg.participants.includes(userId)) return { ok: false, code: 'FORBIDDEN' };
  } else if (msg.type === 'room') {
    const userRoomId = roomService.getUserRoom(userId).id;
    if (userRoomId !== msg.roomId) return { ok: false, code: 'FORBIDDEN' };
  }
  
  if (!receipts.has(messageId)) {
    receipts.set(messageId, { receivedBy: new Set(), readBy: new Set() });
  }
  receipts.get(messageId).receivedBy.add(userId);
  store.saveReceipts();
  return { ok: true };
}

export function markRead(messageId, userId) {
  const msg = getMessage(messageId);
  if (!msg) return { ok: false };
  if (msg.authorId === userId) return { ok: false };
  if (msg.deleted) return { ok: false };
  
  if (msg.type === 'private') {
    if (!msg.participants.includes(userId)) return { ok: false, code: 'FORBIDDEN' };
  } else if (msg.type === 'room') {
    const userRoomId = roomService.getUserRoom(userId).id;
    if (userRoomId !== msg.roomId) return { ok: false, code: 'FORBIDDEN' };
  }
  
  if (!receipts.has(messageId)) {
    receipts.set(messageId, { receivedBy: new Set(), readBy: new Set() });
  }
  receipts.get(messageId).readBy.add(userId);
  // Also mark as received
  receipts.get(messageId).receivedBy.add(userId);
  store.saveReceipts();
  return { ok: true };
}

export function getReceipts(messageId) {
  if (!receipts.has(messageId)) {
    return { receivedBy: [], readBy: [] };
  }
  const rec = receipts.get(messageId);
  return {
    receivedBy: Array.from(rec.receivedBy),
    readBy: Array.from(rec.readBy)
  };
}

export function getRoomHistory(roomId, limit = 50) {
  return messages
    .filter(m => m.type === 'room' && m.roomId === roomId)
    .slice(-limit)
    .map(m => serializeMessage(m));
}

export function getPrivateHistory(userId1, userId2, limit = 50) {
  const key = getConvKey(userId1, userId2);
  const conv = privateConvs.get(key);
  if (!conv) return [];
  return conv.messages
    .map(id => messages.find(m => m.id === id))
    .filter(Boolean)
    .slice(-limit)
    .map(m => serializeMessage(m));
}

export function getPrivateConversations(userId) {
  const convs = [];
  for (const [key, conv] of privateConvs.entries()) {
    if (conv.participants.has(userId)) {
      const otherId = Array.from(conv.participants).find(id => id !== userId);
      convs.push({ conversationId: key, otherId, participants: Array.from(conv.participants) });
    }
  }
  return convs;
}

export function canAccessMessage(messageId, userId) {
  const msg = getMessage(messageId);
  if (!msg) return false;
  if (msg.type === 'private') {
    return msg.participants.includes(userId);
  } else if (msg.type === 'room') {
    const userRoomId = roomService.getUserRoom(userId).id;
    return userRoomId === msg.roomId;
  }
  return false;
}

export default {
  createRoomMessage,
  createPrivateMessage,
  getMessage,
  editMessage,
  removeMessage,
  addReaction,
  markReceived,
  markRead,
  getReceipts,
  getRoomHistory,
  getPrivateHistory,
  getPrivateConversations,
  canAccessMessage,
  serializeMessage
};