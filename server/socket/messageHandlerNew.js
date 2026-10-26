import messageServiceNew from '../services/messageServiceNew.js';
import userHandler from './userHandlerNew.js';
import roomService from '../services/roomService.js';
import typingService from '../services/typingService.js';
import { send, makeError } from '../protocol.js';

export function handleNew(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before sending messages.", msg.requestId));
    return;
  }
  const content = msg?.payload?.content;
  if (typeof content !== "string" || !content.trim() || content.length > 1000) {
    send(ws, makeError("INVALID_PAYLOAD", "message:new requires a non-empty 'content' string.", msg.requestId));
    return;
  }
  const replyToId = msg?.payload?.replyToId || msg?.payload?.replyToMessageId || null;
  const roomId = ws.currentRoomId || roomService.getDefaultRoom().id;
  
  const created = messageServiceNew.createRoomMessage(author, content, roomId, replyToId);
  userHandler.broadcastToRoom(wss, roomId, { type: "message:new", requestId: msg.requestId, payload: created });
}

export function handleEdit(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before editing messages.", msg.requestId));
    return;
  }
  const messageId = msg?.payload?.messageId;
  const content = msg?.payload?.content;
  if (typeof messageId !== "string" || typeof content !== "string" || !content.trim() || content.length > 1000) {
    send(ws, makeError("INVALID_PAYLOAD", "message:edit requires 'messageId' and 'content'.", msg.requestId));
    return;
  }
  const result = messageServiceNew.editMessage(messageId, author, content);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not edit message.", msg.requestId));
    return;
  }
  
  const message = result.message;
  if (message.type === 'private') {
    userHandler.broadcastToUsers(wss, message.participants, { type: "message:edit", requestId: msg.requestId, payload: message });
  } else if (message.type === 'room') {
    userHandler.broadcastToRoom(wss, message.roomId, { type: "message:edit", requestId: msg.requestId, payload: message });
  }
}

export function handleDelete(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before deleting messages.", msg.requestId));
    return;
  }
  const messageId = msg?.payload?.messageId;
  if (typeof messageId !== "string") {
    send(ws, makeError("INVALID_PAYLOAD", "message:delete requires 'messageId'.", msg.requestId));
    return;
  }
  const result = messageServiceNew.removeMessage(messageId, author);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not delete message.", msg.requestId));
    return;
  }
  
  const message = result.message;
  if (message.type === 'private') {
    userHandler.broadcastToUsers(wss, message.participants || [], { type: "message:delete", requestId: msg.requestId, payload: message });
  } else if (message.type === 'room') {
    userHandler.broadcastToRoom(wss, message.roomId, { type: "message:delete", requestId: msg.requestId, payload: message });
  } else {
    // Fallback broadcast to room
    const roomId = ws.currentRoomId;
    if (roomId) userHandler.broadcastToRoom(wss, roomId, { type: "message:delete", requestId: msg.requestId, payload: message });
  }
}

export function handlePrivate(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before sending messages.", msg.requestId));
    return;
  }
  const recipientId = msg?.payload?.recipientId;
  const content = msg?.payload?.content;
  const replyToId = msg?.payload?.replyToId || null;
  
  if (!recipientId || typeof content !== "string" || !content.trim()) {
    send(ws, makeError("INVALID_PAYLOAD", "message:private requires 'recipientId' and non-empty 'content'.", msg.requestId));
    return;
  }
  if (recipientId === author.id) {
    send(ws, makeError("INVALID_RECIPIENT", "Cannot send private message to yourself.", msg.requestId));
    return;
  }
  
  const result = messageServiceNew.createPrivateMessage(author, content, recipientId, replyToId);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not send private message.", msg.requestId));
    return;
  }
  
  const message = result.message;
  userHandler.broadcastToUsers(wss, [author.id, recipientId], { type: "message:private", payload: message });
}

export function handleTypingStart(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) return;
  const conversationType = msg?.payload?.conversationType || 'room'; // 'room' or 'private'
  let key;
  if (conversationType === 'room') {
    key = 'room:' + (ws.currentRoomId || roomService.getDefaultRoom().id);
  } else {
    const otherId = msg?.payload?.otherId;
    if (!otherId) return;
    const sorted = [author.id, otherId].sort();
    key = 'private:' + sorted.join(':');
  }
  typingService.startTyping(key, author.id);
  
  // Broadcast to relevant users
  if (conversationType === 'room') {
    const roomId = ws.currentRoomId;
    userHandler.broadcastToRoom(wss, roomId, { 
      type: "typing:start", 
      payload: { userId: author.id, userName: author.name, conversationType: 'room', roomId } 
    });
  } else {
    const otherId = msg?.payload?.otherId;
    userHandler.broadcastToUsers(wss, [author.id, otherId], { 
      type: "typing:start", 
      payload: { userId: author.id, userName: author.name, conversationType: 'private', otherId: author.id } 
    });
  }
}

export function handleTypingStop(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) return;
  const conversationType = msg?.payload?.conversationType || 'room';
  let key;
  if (conversationType === 'room') {
    key = 'room:' + (ws.currentRoomId || roomService.getDefaultRoom().id);
  } else {
    const otherId = msg?.payload?.otherId;
    if (!otherId) return;
    const sorted = [author.id, otherId].sort();
    key = 'private:' + sorted.join(':');
  }
  typingService.stopTyping(key, author.id);
  
  if (conversationType === 'room') {
    const roomId = ws.currentRoomId;
    userHandler.broadcastToRoom(wss, roomId, { 
      type: "typing:stop", 
      payload: { userId: author.id, conversationType: 'room', roomId } 
    });
  } else {
    const otherId = msg?.payload?.otherId;
    userHandler.broadcastToUsers(wss, [author.id, otherId], { 
      type: "typing:stop", 
      payload: { userId: author.id, conversationType: 'private' } 
    });
  }
}

export function handleReaction(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before reacting.", msg.requestId));
    return;
  }
  const messageId = msg?.payload?.messageId;
  const emoji = msg?.payload?.emoji;
  if (!messageId || !emoji) {
    send(ws, makeError("INVALID_PAYLOAD", "reaction:add requires 'messageId' and 'emoji'.", msg.requestId));
    return;
  }
  // Allow only specific emojis or any? Problem says "Permitir al menos 👍 ❤️ 😂"
  const allowed = ['👍', '❤️', '😂', '😀', '😢', '😮'];
  if (!allowed.includes(emoji)) {
    send(ws, makeError("INVALID_EMOJI", "Emoji not allowed.", msg.requestId));
    return;
  }
  
  const result = messageServiceNew.addReaction(messageId, author.id, emoji);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not add reaction.", msg.requestId));
    return;
  }
  
  const message = messageServiceNew.getMessage(messageId);
  if (message.type === 'private') {
    userHandler.broadcastToUsers(wss, message.participants, { type: "reaction:update", payload: { messageId, reactions: result.message.reactions } });
  } else if (message.type === 'room') {
    userHandler.broadcastToRoom(wss, message.roomId, { type: "reaction:update", payload: { messageId, reactions: result.message.reactions } });
  }
}

export function handleReceipt(ws, msg, wss) {
  const user = userHandler.current(ws);
  if (!user) return;
  const messageId = msg?.payload?.messageId;
  const type = msg?.payload?.receiptType; // 'received' or 'read'
  if (!messageId) return;
  
  if (type === 'received') {
    messageServiceNew.markReceived(messageId, user.id);
  } else if (type === 'read') {
    messageServiceNew.markRead(messageId, user.id);
  }
  
  const message = messageServiceNew.getMessage(messageId);
  if (message) {
    const receipts = messageServiceNew.getReceipts(messageId);
    if (message.type === 'private') {
      userHandler.broadcastToUsers(wss, message.participants, { type: "receipt:update", payload: { messageId, receipts } });
    } else if (message.type === 'room') {
      // Broadcast to room members except maybe? Or to all in room
      userHandler.broadcastToRoom(wss, message.roomId, { type: "receipt:update", payload: { messageId, receipts } });
    }
  }
}

export default {
  handleNew,
  handleEdit,
  handleDelete,
  handlePrivate,
  handleTypingStart,
  handleTypingStop,
  handleReaction,
  handleReceipt
};