import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { PORT, PUBLIC_DIR } from './config.js';
import { attachConnections } from './lab/connection.js';
const app = express();
app.use(express.static(PUBLIC_DIR));
app.get('/health', (_req, res) => res.json({ ok: true }));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
attachConnections(wss);
server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log('Chat: http://localhost:' + PORT));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const ws of wss.clients) ws.close(1001, 'Servidor detenido');
  wss.close(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
