import { randomUUID } from 'node:crypto';
import { store } from '../store/store.js';

const rooms = store.state.rooms;

// userId -> roomId
const userRoom = new Map(); // active membership
const roomMembers = new Map(); // roomId -> Set<userId>

function ensureRoomMaps() {
  for (const room of rooms.values()) {
    if (!roomMembers.has(room.id)) {
      roomMembers.set(room.id, new Set());
    }
  }
}

ensureRoomMaps();

export function getDefaultRoom() {
  for (const room of rooms.values()) {
    if (room.isDefault) return room;
  }
  const general = { id: 'room:general', name: 'General', createdAt: Date.now(), createdBy: 'system', isDefault: true };
  rooms.set(general.id, general);
  if (!roomMembers.has(general.id)) roomMembers.set(general.id, new Set());
  store.saveRooms();
  return general;
}

export function createRoom(name, createdBy) {
  if (typeof name !== 'string') return { ok: false, code: 'INVALID_NAME' };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 32) return { ok: false, code: 'INVALID_NAME' };
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return { ok: false, code: 'INVALID_NAME' };
  if (trimmed.toLowerCase() === 'general') return { ok: false, code: 'INVALID_NAME' };
  
  const id = 'room:' + randomUUID();
  const room = { id, name: trimmed, createdAt: Date.now(), createdBy, isDefault: false };
  rooms.set(id, room);
  roomMembers.set(id, new Set());
  store.saveRooms();
  return { ok: true, room };
}

export function listRooms() {
  return Array.from(rooms.values());
}

export function joinRoom(userId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };
  
  // Leave current room if any
  const currentRoomId = userRoom.get(userId);
  if (currentRoomId && currentRoomId !== roomId) {
    const members = roomMembers.get(currentRoomId);
    if (members) members.delete(userId);
  }
  
  userRoom.set(userId, roomId);
  if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set());
  roomMembers.get(roomId).add(userId);
  
  return { ok: true, room };
}

export function leaveRoom(userId) {
  const currentRoomId = userRoom.get(userId);
  if (currentRoomId) {
    const members = roomMembers.get(currentRoomId);
    if (members) members.delete(userId);
    userRoom.delete(userId);
  }
}

export function getUserRoom(userId) {
  const roomId = userRoom.get(userId);
  if (!roomId) return getDefaultRoom();
  return rooms.get(roomId) || getDefaultRoom();
}

export function getRoomMembers(roomId) {
  const members = roomMembers.get(roomId);
  if (!members) return [];
  return Array.from(members);
}

export function getRoomMemberCount(roomId) {
  const members = roomMembers.get(roomId);
  return members ? members.size : 0;
}

export function removeUserFromAllRooms(userId) {
  for (const [roomId, members] of roomMembers.entries()) {
    members.delete(userId);
  }
  userRoom.delete(userId);
}

export default {
  getDefaultRoom,
  createRoom,
  listRooms,
  joinRoom,
  leaveRoom,
  getUserRoom,
  getRoomMembers,
  getRoomMemberCount,
  removeUserFromAllRooms
};