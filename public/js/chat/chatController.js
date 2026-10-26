import { socket } from '../transport/socketClient.js';
import * as view from './chatView.js';
import { createRealtime } from './realtimeClient.js';
import { savedToken, tokenForName, saveSession, forgetInvalidToken, clearTabToken } from './sessionStore.js';
import { messageDialog } from './dialogs.js';
const $ = id => document.getElementById(id);
const state = { user: null, room: null, rooms: [], users: [], otherId: null, messages: new Map(), replyId: null, ready: false };
const pending = new Map();
let initialized = false;
let realtime;
let attemptedToken = null;
function render() {
  view.rooms(state.rooms, state.otherId ? null : state.room?.id);
  view.users(state.users, state.user?.id, state.room?.id);
  const other = state.users.find(u => u.id === state.otherId);
  view.title(state.otherId ? 'Chat privado con ' + (other?.name || 'Usuario') : 'Sala · ' + (state.room?.name || 'General'));
  view.privateContext(other, state.room);
  view.messages([...state.messages.values()].sort((a,b) => a.createdAt - b.createdAt), state.user?.id, state.replyId);
  view.enabled(state.ready);
  if (state.otherId && !other?.online) { $('send-btn').disabled = true; $('composer-input').disabled = true; } else $('composer-input').disabled = !state.ready;
  realtime?.afterRender();
}
function matches(message) { return state.otherId ? message.type === 'private' && message.participants.includes(state.otherId) && message.participants.includes(state.user?.id) : message.type === 'room' && message.roomId === state.room?.id; }
function receive(message) {
  realtime?.markReceived(message);
  if (matches(message)) { state.messages.set(message.id, message); render(); }
  else if (message.type === 'private' && message.authorId !== state.user?.id) view.notice('Nuevo mensaje privado de ' + message.authorName + '. Ábrelo desde la lista de usuarios.');
}
function clearConversation() { view.notice(''); $('send-status').textContent = ''; realtime?.changeConversation(); state.messages.clear(); state.replyId = null; render(); }
export function init() {
  if (initialized) return; initialized = true;
  realtime = createRealtime(socket, () => state);
  socket.on('open', () => {
    state.ready = false; view.enabled(false);
    const token = attemptedToken = savedToken();
    view.status(token ? 'Recuperando sesión…' : 'Conectado · ingresa tu nombre', true);
    if (token) socket.send('session:join', { sessionToken: token });
  });
  socket.on('close', () => { state.ready = false; view.enabled(false); view.status('Desconectado', false); pending.clear(); });
  socket.on('reconnecting', () => view.status('Reconectando…', false));
  socket.on('session:joined', ({ payload }) => {
    state.user = payload.user; state.room = payload.room; state.ready = true;
    if (!saveSession(payload.user, payload.sessionToken)) view.notice('No se pudo guardar la sesión en este navegador.'); view.screen(true); view.status('Conectado', true); view.notice(''); render();
    if (state.otherId) socket.send('private:history', { otherId: state.otherId });
  });
  socket.on('error', (event) => {
    if (pending.delete(event.requestId)) $('send-status').textContent = 'No enviado. Se conservó el borrador.';
    view.notice(event.message); $('login-error').textContent = event.message;
    if (event.code === 'SESSION_INVALID' || event.code === 'SESSION_IN_USE') {
      if (event.code === 'SESSION_INVALID') forgetInvalidToken(attemptedToken); else clearTabToken(); state.ready = false; state.user = null; state.otherId = null; state.messages.clear(); view.screen(false); view.enabled(false); view.status('Conectado · vuelve a ingresar', true);
    }
  });
  socket.on('users:list', ({ payload }) => { state.users = payload.users; render(); });
  socket.on('rooms:list', ({ payload }) => { state.rooms = payload.rooms; render(); });
  socket.on('room:created', ({ payload }) => socket.send('room:join', { roomId: payload.room.id }));
  socket.on('room:joined', ({ payload }) => { state.otherId = null; state.room = payload.room; clearConversation(); });
  socket.on('history:room', ({ payload }) => { if (state.otherId || payload.roomId !== state.room?.id) return; state.messages = new Map(payload.messages.map(m => [m.id,m])); payload.messages.forEach(realtime.markReceived); render(); });
  socket.on('history:private', ({ payload }) => { if (payload.otherId !== state.otherId) return; state.messages = new Map(payload.messages.map(m => [m.id,m])); payload.messages.forEach(realtime.markReceived); render(); });
  // ------- Retos 2 y 3: Recibir estados y reacciones por WebSocket -------
  for (const event of ['message:new', 'message:private', 'message:edit', 'message:delete', 'receipt:update', 'reaction:update']) socket.on(event, ({ payload }) => receive(payload));
  socket.on('message:ack', ({ requestId, payload }) => {
    const sent = pending.get(requestId); pending.delete(requestId); receive(payload.message);
    $('send-status').textContent = 'Enviado';
    if (sent && sent.conversation === (state.otherId || state.room?.id) && $('composer-input').value.trim() === sent.content) { $('composer-input').value = ''; state.replyId = null; render(); }
  });
  socket.on('user:joined', ({payload}) => { if (payload.id !== state.user?.id) view.notice(payload.name + ' se ha conectado.'); });
  socket.on('user:left', ({payload}) => view.notice(payload.name + ' se ha desconectado.'));
  $('login-form').addEventListener('submit', event => {
    event.preventDefault(); $('login-error').textContent = '';
    const name = $('name-input').value.trim(); attemptedToken = tokenForName(name);
    if (!socket.send('session:join', attemptedToken ? { sessionToken: attemptedToken } : { name })) $('login-error').textContent = 'Espera a que se conecte el servidor.';
  });
  $('room-create-form').addEventListener('submit', event => {
    // ------- Reto 6: Crear y seleccionar salas -------
    event.preventDefault(); if (!state.ready) return;
    if (socket.send('room:create', { name: $('room-create-input').value.trim() })) $('room-create-input').value = '';
  });
  $('rooms-list').addEventListener('click', event => {
    const roomId = event.target.closest('[data-room]')?.dataset.room; if (roomId && state.ready) socket.send('room:join', { roomId });
  });
  $('users-list').addEventListener('click', event => {
    // ------- Reto 5: Abrir conversación privada -------
    const id = event.target.closest('[data-user]')?.dataset.user; if (!id || id === state.user?.id || !state.ready) return;
    state.otherId = id; clearConversation(); socket.send('private:history', { otherId: id });
  });
  $('composer-form').addEventListener('submit', event => {
    event.preventDefault(); const content = $('composer-input').value.trim();
    if (!state.ready || !content || content.length > 1000) return;
    if ([...pending.values()].some(p => p.content === content && p.conversation === (state.otherId || state.room.id))) return;
    realtime.stop();
    const requestId = socket.send(state.otherId ? 'message:private' : 'message:new', { content, clientMessageId: crypto.randomUUID(), recipientId: state.otherId, replyToId: state.replyId });
    if (requestId) { pending.set(requestId, { content, conversation: state.otherId || state.room.id }); $('send-status').textContent = 'Enviando…'; }
  });
  $('message-area').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button || !state.ready) return;
    const messageId = button.closest('[data-message-id]').dataset.messageId; const message = state.messages.get(messageId);
    // ------- Reto 9: Responder citando un mensaje de la conversación -------
    if (button.dataset.action === 'reply') { state.replyId = messageId; render(); $('composer-input').focus(); }
    if (button.dataset.action === 'edit') { const content = await messageDialog({title:'Editar mensaje',text:'El cambio se actualizará para todos los participantes.',value:message.content,confirmText:'Guardar cambios'}); if (content) socket.send('message:edit', { messageId, content }); }
    // ------- Reto 4: Eliminar mensaje propio con confirmación -------
    if (button.dataset.action === 'delete' && await messageDialog({title:'¿Eliminar mensaje?',text:'El contenido se reemplazará por «Mensaje eliminado» para todos los participantes.',confirmText:'Eliminar mensaje',danger:true})) socket.send('message:delete', { messageId });
    // ------- Reto 3: Agregar o quitar reacción propia -------
    if (button.dataset.action === 'react') socket.send('reaction:add', { messageId, emoji: button.dataset.emoji });
  });
  $('back-to-room').addEventListener('click', () => { if (state.ready) socket.send('room:join', {roomId:state.room.id}); });
  $('reply-cancel').addEventListener('click', () => { state.replyId = null; render(); });
  view.enabled(false); socket.connect();
}
