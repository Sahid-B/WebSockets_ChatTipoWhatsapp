import messageServiceNew from '../services/messageServiceNew.js';
import userHandler from './userHandlerNew.js';
import { send, makeError } from '../protocol.js';

export function handleGetPrivateConversations(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat.", msg.requestId));
    return;
  }
  const convs = messageServiceNew.getPrivateConversations(author.id);
  // Enrich with user names
  const enriched = convs.map(c => {
    const otherId = c.otherId;
    // Try to find user info
    return { ...c, otherId };
  });
  send(ws, { type: "private:list", requestId: msg.requestId, payload: { conversations: enriched } });
}

export function handleGetPrivateHistory(ws, msg, wss) {
  const author = userHandler.current(ws);
  if (!author) {
    send(ws, makeError("NOT_IDENTIFIED", "You must join the chat.", msg.requestId));
    return;
  }
  const otherId = msg?.payload?.otherId;
  if (!otherId) {
    send(ws, makeError("INVALID_PAYLOAD", "otherId required.", msg.requestId));
    return;
  }
  const history = messageServiceNew.getPrivateHistory(author.id, otherId, 50);
  send(ws, { type: "history:private", requestId: msg.requestId, payload: { otherId, messages: history } });
}

export default {
  handleGetPrivateConversations,
  handleGetPrivateHistory
};