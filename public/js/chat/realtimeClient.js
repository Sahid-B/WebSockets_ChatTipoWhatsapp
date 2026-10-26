// ------- Reto 1: Escritura con frecuencia limitada, parada y expiración -------
export function createRealtime(socket, getState) {
  let typingSentAt = 0, idleTimer, observer;
  const writers = new Map(), received = new Set(), read = new Set();
  const $ = id => document.getElementById(id);
  const matchesTyping = event => {
    const state = getState();
    return state.otherId ? event.conversationType === 'private' && event.participants?.includes(state.otherId) && event.participants.includes(state.user?.id) : event.conversationType === 'room' && event.roomId === state.room?.id;
  };
  function showWriters() {
    const names = [...writers.values()].map(w => w.userName);
    $('typing-indicator').textContent = names.length ? names.join(', ') + (names.length === 1 ? ' está escribiendo…' : ' están escribiendo…') : '';
  }
  function clearWriter(id) { clearTimeout(writers.get(id)?.timer); writers.delete(id); showWriters(); }
  function clearWriters() { for (const id of [...writers.keys()]) clearWriter(id); }
  function stop() { clearTimeout(idleTimer); typingSentAt = 0; socket.send('typing:stop', {}); }
  function changeConversation() { stop(); clearWriters(); }
  $('composer-input').addEventListener('input', () => {
    const state = getState();
    if (!state.ready || !$('composer-input').value.trim()) { stop(); return; }
    if (Date.now() - typingSentAt >= 900) {
      socket.send('typing:start', { conversationType: state.otherId ? 'private' : 'room', otherId: state.otherId }); typingSentAt = Date.now();
    }
    clearTimeout(idleTimer); idleTimer = setTimeout(stop, 1500);
  });
  $('composer-input').addEventListener('blur', stop);
  socket.on('typing:start', ({ payload }) => {
    if (payload.userId === getState().user?.id || !matchesTyping(payload)) return;
    clearWriter(payload.userId);
    writers.set(payload.userId, { ...payload, timer: setTimeout(() => clearWriter(payload.userId), 3300) }); showWriters();
  });
  socket.on('typing:stop', ({ payload }) => clearWriter(payload.userId));
  socket.on('user:left', ({ payload }) => clearWriter(payload.id));
  socket.on('close', () => { clearTimeout(idleTimer); typingSentAt = 0; clearWriters(); received.clear(); read.clear(); observer?.disconnect(); });

  // ------- Reto 2: Recibido en cliente y leído solo con mensaje visible -------
  function eligible(message) { const id=getState().user?.id; return !message.deleted && message.authorId !== id && message.delivery?.expected.includes(id); }
  function markReceived(message) {
    if (!eligible(message) || received.has(message.id) || message.delivery.receivedBy.includes(getState().user.id)) return;
    if (socket.send('receipt:mark', { messageId: message.id, receiptType: 'received' })) received.add(message.id);
  }
  function markVisibleReads() {
    if (!getState().ready || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const area=$('message-area').getBoundingClientRect();
    for (const article of $('message-area').querySelectorAll('[data-message-id]')) {
      const message=getState().messages.get(article.dataset.messageId), rect=article.getBoundingClientRect();
      if (!message || !eligible(message) || read.has(message.id) || message.delivery.readBy.includes(getState().user.id)) continue;
      if (rect.bottom > area.top && rect.top < area.bottom && rect.right > area.left && rect.left < area.right) {
        if (socket.send('receipt:mark', { messageId: message.id, receiptType: 'read' })) { read.add(message.id); received.add(message.id); }
      }
    }
  }
  function afterRender() {
    observer?.disconnect();
    observer = new IntersectionObserver(markVisibleReads, { root: $('message-area'), threshold: 0 });
    for (const article of $('message-area').querySelectorAll('[data-message-id]')) observer.observe(article);
    markVisibleReads();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') stop(); else markVisibleReads(); });
  window.addEventListener('focus', markVisibleReads);
  window.addEventListener('blur', stop);
  $('message-area').addEventListener('scroll', markVisibleReads, { passive: true });
  return { stop, changeConversation, markReceived, afterRender };
}
