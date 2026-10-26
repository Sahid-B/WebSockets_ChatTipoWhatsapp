import { randomUUID } from 'node:crypto';
import { send, makeError } from '../protocol.js';
import sessionService from '../services/sessionService.js';
import roomService from '../services/roomService.js';
import messageServiceNew from '../services/messageServiceNew.js';

// connections: connectionId -> { ws, userId, user, roomId, conversationKey, sessionToken }
const connections = new Map();
const users = new Map(); // userId -> { id, name, connectionId, joinedAt, sessionToken }

export function getConnection(wss, userId) {
  const user = users.get(userId);
  if (!user) return undefined;
  for (const client of wss.clients) {
    if (client.connectionId === user.connectionId) return client;
  }
  return undefined;
}

export function register(ws, name, sessionToken = null) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 24) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  // Try to restore from session
  if (sessionToken) {
    const session = sessionService.validateSession(sessionToken);
    if (session) {
      const known = sessionService.getKnownUser(session.userId);
      if (known) {
        // Reconnect existing user
        const user = {
          id: session.userId,
          name: trimmed,
          connectionId: ws.connectionId,
          joinedAt: known.createdAt,
          sessionToken
        };
        users.set(user.id, user);
        ws.user = user;
        ws.userId = user.id;
        connections.set(ws.connectionId, { ws, userId: user.id, user, sessionToken });
        
        // Join default/current room
        const room = roomService.getUserRoom(user.id);
        ws.currentRoomId = room.id;
        roomService.joinRoom(user.id, room.id);
        return user;
      }
    }
  }

  // New user
  const id = randomUUID();
  const user = { id, name: trimmed, connectionId: ws.connectionId, joinedAt: Date.now(), sessionToken: null };
  users.set(id, user);
  ws.user = user;
  ws.userId = id;
  
  sessionService.registerKnownUser(user);
  const newToken = sessionService.createSession(id);
  user.sessionToken = newToken;
  ws.sessionToken = newToken;
  
  connections.set(ws.connectionId, { ws, userId: id, user, sessionToken: newToken });
  
  // Join default room
  const room = roomService.getDefaultRoom();
  ws.currentRoomId = room.id;
  roomService.joinRoom(id, room.id);
  
  return user;
}

export function disconnect(wss, ws, user) {
  connections.delete(ws.connectionId);
  if (!user) return;
  sessionService.updateLastDisconnect(user.id);
  roomService.removeUserFromAllRooms(user.id);
  users.delete(user.id);
  const remaining = getUserListForRoom(ws.currentRoomId);
  broadcastToRoom(wss, ws.currentRoomId, { type: "users:list", payload: { users: remaining, count: remaining.length, roomId: ws.currentRoomId } });
  
  broadcastToRoom(wss, ws.currentRoomId, {
    type: "user:left",
    payload: { userId: user.id, name: user.name, lastDisconnectedAt: Date.now() }
  });
}

export function broadcast(wss, data) {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) send(client, data);
  }
}

export function broadcastToRoom(wss, roomId, data) {
  if (!wss) return;
  const members = roomService.getRoomMembers(roomId);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.userId && members.includes(client.userId)) {
      send(client, data);
    }
  }
}

export function broadcastToUsers(wss, userIds, data) {
  if (!wss) return;
  const userIdSet = new Set(userIds);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.userId && userIdSet.has(client.userId)) {
      send(client, data);
    }
  }
}

export function notifyJoin(wss, user) {
  broadcastToRoom(wss, user.currentRoomId || roomService.getDefaultRoom().id, {
    type: "user:joined",
    payload: { id: user.id, name: user.name, joinedAt: user.joinedAt }
  });
}

export function current(ws) {
  return ws.user ?? null;
}

export function getUserListForRoom(roomId) {
  const members = roomService.getRoomMembers(roomId);
  const result = [];
  for (const memberId of members) {
    const user = users.get(memberId);
    if (user) {
      const known = sessionService.getKnownUser(memberId);
      result.push({
        id: user.id,
        name: user.name,
        joinedAt: user.joinedAt,
        lastDisconnectedAt: known?.lastDisconnectedAt || null
      });
    }
  }
  return result;
}

export function handleJoin(ws, msg, wss) {
  if (ws.user) { send(ws, makeError("ALREADY_JOINED", "Ya ingresaste al chat.", msg.requestId)); return; }
  const name = msg?.payload?.name;
  const sessionToken = msg?.payload?.sessionToken;
  const user = register(ws, name, sessionToken);
  if (!user) {
    send(ws, makeError("INVALID_NAME", "Name must be a non-empty string of up to 24 characters.", msg.requestId));
    return;
  }
  
  const room = roomService.getUserRoom(user.id);
  ws.currentRoomId = room.id;
  
  // Send session info
  send(ws, { 
    type: "session:joined", 
    requestId: msg.requestId, 
    payload: { 
      user: { id: user.id, name: user.name, joinedAt: user.joinedAt },
      sessionToken: user.sessionToken,
      room: room
    } 
  });
  
  // Send room history
  const history = messageServiceNew.getRoomHistory(room.id, 50);
  send(ws, { type: "history:room", payload: { roomId: room.id, messages: history } });
  
  // Notify others
  notifyJoin(wss, { ...user, currentRoomId: room.id });
  
  // Send updated user list
  const userList = getUserListForRoom(room.id);
  broadcastToRoom(wss, room.id, { 
    type: "users:list", 
    payload: { users: userList, count: userList.length, roomId: room.id } 
  });
}

export function handleList(ws, msg, wss) {
  const roomId = ws.currentRoomId || roomService.getDefaultRoom().id;
  const userList = getUserListForRoom(roomId);
  send(ws, { 
    type: "users:list", 
    requestId: msg.requestId, 
    payload: { users: userList, count: userList.length, roomId } 
  });
}

export default {
  getConnection,
  register,
  disconnect,
  broadcast,
  broadcastToRoom,
  broadcastToUsers,
  notifyJoin,
  current,
  getUserListForRoom,
  handleJoin,
  handleList,
  connections,
  users
};