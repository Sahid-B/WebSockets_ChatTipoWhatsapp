// Ventanas integradas: sin window.confirm ni window.prompt del navegador.
export function messageDialog({ title, text, value, confirmText, danger = false }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'chat-dialog';
    const form = document.createElement('form'); form.method = 'dialog';
    const icon = document.createElement('div'); icon.className = 'dialog-icon'; icon.textContent = danger ? '×' : '✎';
    const heading = document.createElement('h2'); heading.id = 'dialog-title'; heading.textContent = title;
    dialog.setAttribute('aria-labelledby', heading.id);
    const description = document.createElement('p'); description.textContent = text;
    form.append(icon, heading, description);
    let input;
    if (value !== undefined) {
      input = document.createElement('textarea'); input.value = value; input.maxLength = 1000; input.required = true;
      input.setAttribute('aria-label', 'Contenido del mensaje'); form.appendChild(input);
    }
    const actions = document.createElement('div'); actions.className = 'dialog-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = 'Cancelar'; cancel.onclick = () => dialog.close();
    const confirm = document.createElement('button'); confirm.type = 'submit'; confirm.textContent = confirmText; if (danger) confirm.className = 'danger';
    actions.append(cancel, confirm); form.append(actions); dialog.appendChild(form); document.body.appendChild(dialog);
    let result = null;
    form.addEventListener('submit', event => { event.preventDefault(); if (input && !input.value.trim()) { input.focus(); return; } result = input ? input.value.trim() : true; dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close(); } });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
    dialog.showModal();
    if (input) { input.focus(); input.select(); } else cancel.focus();
  });
}
