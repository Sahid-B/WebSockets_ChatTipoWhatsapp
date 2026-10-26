const $ = id => document.getElementById(id);
export function status(text, connected) { $('status-text').textContent = text; $('status').dataset.state = connected ? 'open' : 'closed'; }
export function notice(text) { $('notice').textContent = text; }
export function screen(joined) { $('login-screen').classList.toggle('active', !joined); $('chat-screen').classList.toggle('active', joined); }
export function enabled(ready) { for (const id of ['send-btn', 'room-create-btn']) $(id).disabled = !ready; }
export function title(text) { $('conversation-title').textContent = text; }
export function privateContext(other, room) {
  $('back-to-room').hidden = !other;
  $('conversation-subtitle').textContent = other ? (other.online ? 'Solo tú y ' + other.name + ' pueden ver esta conversación.' : other.name + ' está desconectado. Puedes consultar el historial y enviar cuando vuelva.') : 'Mensajes para todos los integrantes de esta sala.';
  $('composer-input').placeholder = other ? 'Mensaje privado para ' + other.name + '…' : 'Mensaje para ' + (room?.name || 'General') + '…';
  $('users-list').querySelectorAll('[data-user]').forEach(element => element.classList.toggle('selected-user', element.dataset.user === other?.id));
}
export function rooms(list, selected) {
  $('rooms-list').replaceChildren();
  for (const room of list) { const button = document.createElement('button'); button.textContent = room.name; button.dataset.room = room.id; button.className = room.id === selected ? 'selected' : ''; $('rooms-list').appendChild(button); }
}
export function users(list, current, roomId) {
  // ------- Reto 7: Estado y última conexión visibles -------
  $('user-count').textContent = list.filter(u => u.online && u.roomId === roomId).length;
  $('users-list').replaceChildren();
  for (const user of [...list].sort((a,b) => Number(b.online)-Number(a.online) || a.name.localeCompare(b.name))) {
    const item = document.createElement('li');
    if (current !== user.id) item.dataset.user = user.id;
    const button = document.createElement('button'); button.dataset.user = user.id; button.disabled = current === user.id;
    button.textContent = user.name + (current === user.id ? ' (tú)' : '');
    const subtitle = document.createElement('small');
    subtitle.textContent = user.online ? ('En línea' + (user.roomId === roomId ? ' · en esta sala' : ' · otra sala')) : user.lastDisconnectedAt ? 'Última conexión: ' + new Date(user.lastDisconnectedAt).toLocaleString() : 'Desconectado · hora no disponible';
    item.append(button, subtitle); $('users-list').appendChild(item);
    if (current !== user.id) {
      const action=document.createElement('span'); action.className='private-action'; action.textContent='Abrir chat privado →'; item.appendChild(action);
    }
  }
}
export function messages(list, userId, replyId) {
  const area = $('message-area'); const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
  area.replaceChildren();
  if (!list.length) { const empty = document.createElement('p'); empty.className = 'system-message'; empty.textContent = 'Todavía no hay mensajes en esta conversación.'; area.appendChild(empty); }
  for (const message of list) {
    const article = document.createElement('article'); article.dataset.messageId = message.id; article.className = 'message' + (message.authorId === userId ? ' own' : '');
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = message.authorName + ' · ' + new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (message.editedAt ? ' · editado' : ''); article.appendChild(meta);
    if (message.reply) { const quote = document.createElement('blockquote'); quote.textContent = (message.reply.authorName ? message.reply.authorName + ': ' : '') + message.reply.content; article.appendChild(quote); }
    const content = document.createElement('div'); content.className = 'body'; content.textContent = message.deleted ? 'Mensaje eliminado' : message.content; article.appendChild(content);
    // ------- Reto 2: Enviado, recibido y leído; cantidades reales por destinatario -------
    if (message.authorId === userId && !message.deleted) {
      const delivery = document.createElement('small'); delivery.className = 'delivery-state';
      const expected = message.delivery?.expected.length || 0, received = message.delivery?.receivedBy.length || 0, read = message.delivery?.readBy.length || 0;
      delivery.textContent = !message.delivery ? 'Enviado · sin confirmaciones históricas registradas' : expected ? (read === expected ? 'Leído' : received === expected ? 'Recibido' : 'Enviado') + ' · Recibidos ' + received + '/' + expected + ' · Leídos ' + read + '/' + expected : 'Enviado · sin destinatarios conectados';
      article.appendChild(delivery);
    }
    if (!message.deleted) {
      const controls = document.createElement('div'); controls.className = 'message-controls';
      for (const [action, label] of [['reply', 'Responder'], ['edit', 'Editar'], ['delete', 'Eliminar']]) {
        if (action !== 'reply' && message.authorId !== userId) continue;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = action; button.textContent = label; controls.appendChild(button);
      }
      article.appendChild(controls);
      // ------- Reto 3: Reacciones sincronizadas; resaltar la reacción propia -------
      const reactions = document.createElement('div'); reactions.className = 'reactions';
      for (const emoji of ['👍', '❤️', '😂']) {
        const ids = Array.isArray(message.reactions?.[emoji]) ? message.reactions[emoji] : [];
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'react'; button.dataset.emoji = emoji;
        button.textContent = emoji + (ids.length ? ' ' + ids.length : ''); button.className = ids.includes(userId) ? 'reacted' : '';
        button.setAttribute('aria-pressed', String(ids.includes(userId))); button.setAttribute('aria-label', 'Reaccionar con ' + emoji + ', ' + ids.length + ' reacciones'); reactions.appendChild(button);
      }
      article.appendChild(reactions);
    }
    area.appendChild(article);
  }
  const original = list.find(m => m.id === replyId);
  $('reply-preview').hidden = !original;
  $('reply-text').textContent = original ? 'Respondiendo a ' + original.authorName + ': ' + (original.deleted ? 'Mensaje eliminado' : original.content.slice(0, 90)) : '';
  if (nearBottom) area.scrollTop = area.scrollHeight;
}
