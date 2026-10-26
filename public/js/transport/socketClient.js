export const STATE = { CLOSED: 'closed', CONNECTING: 'connecting', OPEN: 'open' };
export class SocketClient {
  // ------- Reto 8: Reconexión progresiva sin conexiones ni temporizadores duplicados -------
  constructor() { this.handlers = new Map(); this.state = STATE.CLOSED; this.attempt = 0; this.sequence = 0; this.stopped = false; }
  on(type, handler) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(handler); }
  off(type, handler) { this.handlers.get(type)?.delete(handler); }
  emit(type, value) { for (const fn of this.handlers.get(type) || []) { try { fn(value); } catch (e) { console.error(e); } } }
  getState() { return this.state; }
  connect() {
    if (this.ws || this.timer) return;
    this.stopped = false; this.state = STATE.CONNECTING;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(protocol + '//' + location.host + '/ws');
    ws.onopen = () => { this.state = STATE.OPEN; this.attempt = 0; this.emit('open', {}); };
    ws.onmessage = ({ data }) => { try { const message = JSON.parse(data); this.emit(message.type, message); } catch (e) { console.error('Evento inválido', e); } };
    ws.onerror = () => this.emit('transport:error', {});
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.state = STATE.CLOSED; this.emit('close', {});
      if (this.stopped) return;
      const delay = Math.min(15000, 700 * 2 ** Math.min(this.attempt++, 5)) + Math.random() * 300;
      this.emit('reconnecting', { delay });
      this.timer = setTimeout(() => { this.timer = null; this.connect(); }, delay);
    };
  }
  send(type, payload = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const requestId = 'request-' + ++this.sequence;
    this.ws.send(JSON.stringify({ type, payload, requestId }));
    return requestId;
  }
  disconnect() { this.stopped = true; clearTimeout(this.timer); this.timer = null; this.ws?.close(); }
}
export const socket = new SocketClient();
