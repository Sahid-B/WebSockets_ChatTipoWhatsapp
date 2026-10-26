// messageService.js
// Gestión de mensajes del grupo. Estado en memoria: messages es un Array.
// Cada mensaje: { id, authorId, authorName, content, createdAt, editedAt, deleted, replyToId }
// Los IDs y timestamps los genera el servidor; el cliente nunca los provee.
// No hay persistencia en esta etapa.

import { randomUUID } from "node:crypto";
import { MAX_MESSAGE_LENGTH } from "../config.js";

const messages = [];
const MAX_HISTORY = 200;

export function listRecent(limit = 50) {
  return messages.slice(-limit);
}

export function create(author, content, replyToId) {
  const msg = {
    id: randomUUID(),
    authorId: author.id,
    authorName: author.name,
    content: sanitize(content),
    createdAt: Date.now(),
    editedAt: null,
    deleted: false,
    replyToId: replyToId ?? null,
  };
  messages.push(msg);
  if (messages.length > MAX_HISTORY) messages.shift();
  return msg;
}

export function edit(messageId, author, content) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return { ok: false, code: "NOT_FOUND" };
  if (msg.authorId !== author.id) return { ok: false, code: "FORBIDDEN" };
  if (msg.deleted) return { ok: false, code: "DELETED" };
  msg.content = sanitize(content);
  msg.editedAt = Date.now();
  return { ok: true, message: { ...msg } };
}

export function remove(messageId, author) {
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return { ok: false, code: "NOT_FOUND" };
  if (msg.authorId !== author.id) return { ok: false, code: "FORBIDDEN" };
  msg.deleted = true;
  msg.content = "";
  return { ok: true, message: { id: msg.id, deleted: true } };
}

function sanitize(text) {
  if (typeof text !== "string") return "";
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

// FIX: messageHandler.js importa este módulo como default export.
// Se expone un default para que la aplicación arranque sin modificaar el handler.
export default { listRecent, create, edit, remove };