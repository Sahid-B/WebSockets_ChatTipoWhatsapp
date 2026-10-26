import { makeError, send } from "../protocol.js";
import userHandler from "./userHandlerNew.js";
import messageHandler from "./messageHandlerNew.js";
import roomHandler from "./roomHandler.js";
import privateHandler from "./privateHandler.js";

const HANDLERS = {
  "session:join": (ws, msg, wss) => userHandler.handleJoin(ws, msg, wss),
  "users:list": (ws, msg, wss) => userHandler.handleList(ws, msg, wss),
  "message:new": (ws, msg, wss) => messageHandler.handleNew(ws, msg, wss),
  "message:edit": (ws, msg, wss) => messageHandler.handleEdit(ws, msg, wss),
  "message:delete": (ws, msg, wss) => messageHandler.handleDelete(ws, msg, wss),
  "message:private": (ws, msg, wss) => messageHandler.handlePrivate(ws, msg, wss),
  "typing:start": (ws, msg, wss) => messageHandler.handleTypingStart(ws, msg, wss),
  "typing:stop": (ws, msg, wss) => messageHandler.handleTypingStop(ws, msg, wss),
  "reaction:add": (ws, msg, wss) => messageHandler.handleReaction(ws, msg, wss),
  "receipt:mark": (ws, msg, wss) => messageHandler.handleReceipt(ws, msg, wss),
  "rooms:list": (ws, msg, wss) => roomHandler.handleListRooms(ws, msg, wss),
  "room:create": (ws, msg, wss) => roomHandler.handleCreateRoom(ws, msg, wss),
  "room:join": (ws, msg, wss) => roomHandler.handleJoinRoom(ws, msg, wss),
  "private:list": (ws, msg, wss) => privateHandler.handleGetPrivateConversations(ws, msg, wss),
  "private:history": (ws, msg, wss) => privateHandler.handleGetPrivateHistory(ws, msg, wss),
};

export function handle(ws, msg, { wss } = {}) {
  const { type, requestId } = msg;
  const handler = HANDLERS[type];
  if (!handler) {
    send(ws, makeError("UNKNOWN_EVENT", "Evento desconocido: " + type, requestId));
    return;
  }
  try {
    handler(ws, msg, wss);
  } catch (err) {
    console.error('Handler error:', err);
    send(ws, makeError("SERVER_ERROR", "Unexpected server error.", requestId));
  }
}

export default { handle };