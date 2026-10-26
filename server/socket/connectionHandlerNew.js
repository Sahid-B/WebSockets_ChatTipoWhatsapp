import { randomUUID } from 'node:crypto';
import { parseMessage, makeError, send } from '../protocol.js';
import userHandler from './userHandlerNew.js';
import router from './routerNew.js';

export function createConnectionHandler({ wss }) {
  return function onConnection(ws, req) {
    ws.connectionId = randomUUID();
    ws.user = null;
    ws.userId = null;

    send(ws, {
      type: 'session:welcome',
      requestId: randomUUID(),
      payload: { connectionId: ws.connectionId, protocolVersion: 1, authenticated: false },
    });

    ws.on('message', (raw) => {
      const msg = parseMessage(raw);
      if (!msg) {
        send(ws, makeError('INVALID_JSON', 'Message must be valid JSON.', undefined));
        return;
      }
      try {
        router.handle(ws, msg, { wss });
      } catch (err) {
        console.error('Connection handler error:', err);
        send(ws, makeError('SERVER_ERROR', 'Unexpected server error.', msg.requestId));
      }
    });

    ws.on('close', () => {
      userHandler.disconnect(wss, ws, ws.user);
    });

    ws.on('error', () => {});
  };
}

export default { createConnectionHandler };

