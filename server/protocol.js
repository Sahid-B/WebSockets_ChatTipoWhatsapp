// Utilidades compartidas del protocolo WebSocket.
// Cada mensaje es un objeto JSON con al menos `type` y opcionalmente `requestId` y `payload`.

// Crea un mensaje de error estandarizado.
// code: identificador corto del error (string). message: descripción humana.
// requestId: opcional, para correlacionar una respuesta con su solicitud.
export function makeError(code, message, requestId = undefined) {
  const err = { type: "error", code, message };
  if (requestId !== undefined) err.requestId = requestId;
  return err;
}

// Envía un objeto JSON a una conexión WebSocket concreta.
// Silencia errores si la conexión se cerró entre la verificación y el envío.
export function send(ws, data) {
  if (ws.readyState !== ws.OPEN) return false;
  try {
    ws.send(JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Parsea un mensaje entrante. Devuelve null si no es JSON válido.
// Los mensajes inválidos se notifican al cliente pero no terminan el servidor.
export function parseMessage(raw) {
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  if (typeof raw !== "string") return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || typeof obj.type !== "string") return null;
    return obj;
  } catch {
    return null;
  }
}