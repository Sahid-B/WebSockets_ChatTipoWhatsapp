import roomService from '../services/roomService.js';
import userHandler from './userHandlerNew.js';
import messageServiceNew from '../services/messageServiceNew.js';
import { send, makeError } from '../protocol.js';

export function handleListRooms(ws, msg, wss) {
  const rooms = roomService.listRooms();
  send(ws, { type: "rooms:list", requestId: msg.requestId, payload: { rooms } });
}

export function handleCreateRoom(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before creating rooms.", msg.requestId));
    return;
  }
  const name = msg?.payload?.name;
  const result = roomService.createRoom(name, author.id);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not create room.", msg.requestId));
    return;
  }
  // Broadcast new room to all
  userHandler.broadcast(wss, { type: "room:created", payload: { room: result.room } });
  send(ws, { type: "room:created", requestId: msg.requestId, payload: { room: result.room } });
}

export function handleJoinRoom(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat before joining rooms.", msg.requestId));
    return;
  }
  const roomId = msg?.payload?.roomId;
  const result = roomService.joinRoom(author.id, roomId);
  if (!result.ok) {
    send(ws, makeError(result.code, "Could not join room.", msg.requestId));
    return;
  }
  ws.currentRoomId = roomId;
  
  // Send room history
  const history = messageServiceNew.getRoomHistory(roomId, 50);
  send(ws, { type: "history:room", requestId: msg.requestId, payload: { roomId, messages: history } });
  
  // Update user list for the room
  const userList = userHandler.getUserListForRoom(roomId);
  userHandler.broadcastToRoom(wss, roomId, { 
    type: "users:list", 
    payload: { users: userList, count: userList.length, roomId } 
  });
  
  send(ws, { type: "room:joined", requestId: msg.requestId, payload: { room: result.room } });
}

export default {
  handleListRooms,
  handleCreateRoom,
  handleJoinRoom
};