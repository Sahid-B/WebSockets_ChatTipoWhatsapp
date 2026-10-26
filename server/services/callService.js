// callService.js
// Gestión de estado de videollamadas del grupo.
// Estado en memoria: calls es un Map<callId, call>.
// Cada call: { id, callerId, targetId, state, createdAt, participants }
//   - state: "ringing" | "connecting" | "active" | "ended"
//   - participants: Set<userId> de los que ya están involucrados en la señalización.
// Reglas de esta versión:
//   - Una sola llamada simultánea por usuario (caller o target).
//   - El caller y el target se determinan a partir de la conexión (ws.user), nunca del payload.
//   - No se permite llamada a uno mismo.
//   - El target debe estar conectado.
//   - No hay persistencia; al reiniciar el server desaparece todo.

import { randomUUID } from "node:crypto";

const calls = new Map(); // callId -> call
const userActiveCall = new Map(); // userId -> callId (inválido si el usuario no está en la call)

// Estados posibles de una llamada.
export const STATE = {
  RINGING: "ringing",
  CONNECTING: "connecting",
  ACTIVE: "active",
  ENDED: "ended",
};

// Devuelve la llamada asociada a un callId o undefined.
export function getCall(callId) {
  return calls.get(callId);
}

// Devuelve la llamada activa de un usuario (ringing/connecting/active) o undefined.
export function userCall(userId) {
  const callId = userActiveCall.get(userId);
  if (!callId) return undefined;
  return calls.get(callId);
}

// Crea una solicitud de llamada. Devuelve la call o null si no es válida.
// callerUser: objeto { id, name } de la conexión emisora.
// targetUserId: id del usuario al que se llama.
// wss: WebSocketServer para verificar presencia del target.
export function createCall(callerUser, targetUserId, wss) {
  if (!callerUser || !targetUserId) return null;
  if (callerUser.id === targetUserId) return "SELF_CALL";
  if (userActiveCall.has(callerUser.id)) return "ALREADY_IN_CALL";
  if (userActiveCall.has(targetUserId)) return "TARGET_BUSY";

  const targetWs = findConnection(wss, targetUserId);
  if (!targetWs || targetWs.readyState !== targetWs.OPEN) return "TARGET_OFFLINE";

  const call = {
    id: randomUUID(),
    callerId: callerUser.id,
    callerName: callerUser.name,
    targetId: targetUserId,
    state: STATE.RINGING,
    createdAt: Date.now(),
    participants: new Set([callerUser.id, targetUserId]),
  };
  calls.set(call.id, call);
  userActiveCall.set(callerUser.id, call.id);
  userActiveCall.set(targetUserId, call.id);
  return call;
}

// Acepta una llamada que está en ringing. El receptor genera la answer.
// Devuelve la call actualizada o null si no es válida.
export function acceptCall(callId, accepterUser) {
  const call = calls.get(callId);
  if (!call) return "NOT_FOUND";
  if (call.state !== STATE.RINGING) return "NOT_RINGING";
  if (call.targetId !== accepterUser.id) return "NOT_PARTICIPANT";
  call.state = STATE.CONNECTING;
  return call;
}

// Rechaza una llamada que está en ringing.
export function rejectCall(callId, rejecterUser) {
  const call = calls.get(callId);
  if (!call) return "NOT_FOUND";
  if (call.state !== STATE.RINGING) return "NOT_RINGING";
  if (call.targetId !== rejecterUser.id) return "NOT_PARTICIPANT";
  call.state = STATE.ENDED;
  cleanupCall(call.id);
  return call;
}

// Finaliza una llamada. Cualquiera de los dos participantes puede colgar.
// state puede ser "active" o "connecting" (ya aceptada pero aún sin multimedia establecida).
export function endCall(callId, enderUser) {
  const call = calls.get(callId);
  if (!call) return "NOT_FOUND";
  if (!call.participants.has(enderUser.id)) return "NOT_PARTICIPANT";
  if (call.state === STATE.ENDED) return call; // idempotente
  if (call.state !== STATE.ACTIVE && call.state !== STATE.CONNECTING) return "NOT_IN_CALL";
  call.state = STATE.ENDED;
  cleanupCall(call.id);
  return call;
}

// Marca una llamada como multimedia activa (offer/answer intercambiados con éxito).
// Codex completará esto al detectar la conexión establecida.
export function markActive(callId, userId) {
  const call = calls.get(callId);
  if (!call) return "NOT_FOUND";
  if (!call.participants.has(userId)) return "NOT_PARTICIPANT";
  if (call.state !== STATE.CONNECTING) return "NOT_CONNECTING";
  call.state = STATE.ACTIVE;
  return call;
}

// Verifica que un usuario es participante de una call (para señalización).
export function isParticipant(callId, userId) {
  const call = calls.get(callId);
  return !!(call && call.participants.has(userId));
}

// Limpieza interna: elimina la call y los índices de usuario.
function cleanupCall(callId) {
  const call = calls.get(callId);
  if (!call) return;
  calls.delete(callId);
  userActiveCall.delete(call.callerId);
  userActiveCall.delete(call.targetId);
}

// Busca la conexión WebSocket actual de un userId.
function findConnection(wss, userId) {
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.user && client.user.id === userId) {
      return client;
    }
  }
  return undefined;
}

// FIX: callHandler.js importa este módulo como default export.
export default {
  STATE,
  getCall,
  userCall,
  createCall,
  acceptCall,
  rejectCall,
  endCall,
  markActive,
  isParticipant,
};