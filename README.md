# Chat grupal WebSocket

Laboratorio con Node.js >=18, Express 4 y ws 8; interfaz HTML/CSS/JavaScript nativa. Node.js 24 recomendado para ejecutar las pruebas de integración con WebSocket global.

## Instalar y ejecutar

```powershell
npm install
npm start
```

Abrir http://localhost:3000 en dos ventanas con nombres diferentes. Para otra configuración en PowerShell:

```powershell
$env:PORT='3002'
$env:HOST='0.0.0.0'
npm start
```

## Funcionamiento

- Chat grupal, presencia, entradas/salidas, mensajes con autor/hora/ID y edición propia.
- Crear salas y cambiar con los botones laterales. Todos comienzan en General.
- Lista de usuarios conocidos con estado, sala activa y última desconexión observada.
- Seleccionar un usuario para abrir un privado. Para volver a la conversación grupal, seleccionar una sala.
- Responder citando, editar y eliminar mediante acciones del mensaje.
- Reconexión con espera progresiva y recuperación de identidad/sala. Se conserva el borrador; no hay reenvío automático de mensajes sin confirmar.
- Historial persistente y eliminación/edición sincronizadas, incluidas citas.

## Arquitectura activa

`server/server.js` inicia HTTP y WebSocket. `server/lab/connection.js` maneja conexiones/heartbeat/errores, `router.js` eventos y distribución, `users.js` sesiones/presencia, `messages.js` mensajes/autorización/citas, `repository.js` persistencia. Frontend: `transport/socketClient.js`, `chat/chatController.js`, `chat/chatView.js`.

Los módulos previos en server/socket, server/services y server/store se conservaron como trabajo anterior, pero NO forman parte de la ruta activa del servidor. No deben mezclarse con server/lab. El protocolo vigente está en docs/protocol.md.

## Persistencia

`server/data/chat-state.json` guarda usuarios, hashes de sesión, salas, últimos 1000 mensajes y deduplicación. Escritura síncrona serializada con reemplazo atómico; no hay servicios externos. No se publica el directorio de datos. Es una solución para un único proceso Node local, no para varios servidores simultáneos.

Si no existe el snapshot nuevo, se importan usersKnown.json, rooms.json y messages.json anteriores sin borrar originales. Las sesiones antiguas que solo existían en memoria no se pueden recuperar. Un archivo corrupto provoca un error de arranque: no se sobrescribe silenciosamente.

`CHAT_DATA_DIR` permite elegir un directorio aislado para pruebas. No modificar manualmente el JSON mientras el servidor está ejecutándose. Al reiniciar, nadie figura conectado hasta recuperar una sesión real. Un corte abrupto no permite conocer la hora exacta de salida: la interfaz conserva la última hora realmente observada o indica que no está disponible.

## Estado de los nueve retos

Los nueve retos están implementados en la ruta activa. Cada uno está marcado con comentarios `// ------- Reto N: descripción -------`. Consulte docs/RETOS.md para localizar código y probarlos.

1. Escritura: se limita la frecuencia y expira al dejar de escribir, cambiar conversación, perder foco o desconectarse.
2. Recepción/lectura: el servidor confirma enviado, el cliente confirma recibido, y el navegador confirma leído cuando el mensaje está visible en la conversación abierta y la ventana tiene foco. En grupos se muestran cantidades frente a los destinatarios conectados en la sala al enviar. No se cuenta al autor ni a usuarios que ingresan después.
3. Reacciones: 👍 ❤️ 😂, alternables por usuario y persistentes.
4. Eliminar mensajes propios.
5. Mensajes privados.
6. Salas.
7. Última conexión.
8. Reconexión automática con tokens.
9. Respuestas citadas.

Los mensajes anteriores a la incorporación de confirmaciones no tienen destinatarios reconstruidos: su interfaz indica que no hay confirmaciones registradas. No se inventan lecturas históricas.

## Pruebas manuales

1. Entrar como dos usuarios, enviar y editar. Solo el autor ve acciones de edición/eliminación.
2. Crear otra sala, cambiar y comprobar aislamiento de mensajes y contador.
3. Abrir privado, responder citando, editar/eliminar el original y observar la cita.
4. Cerrar un cliente y observar su última conexión en el otro.
5. Recargar la misma pestaña: conserva identidad. Detener y reiniciar servidor: recupera sesión e historial.
6. Probar con un tercer usuario que privados no aparecen en otra conversación.

## Acceso externo

Por ejemplo, con ngrok ya instalado: `ngrok http 3000`. Abrir la URL HTTPS generada desde otro dispositivo. El frontend construye wss automáticamente. El túnel y las pruebas desde celular requieren realizarse aparte; no se afirman realizadas.

No contiene WebRTC, informes PDF ni ZIP académicos.

## Pruebas automatizadas de los nueve retos

Desde el proyecto, en una terminal PowerShell:

```powershell
$env:PORT='43190'
$env:CHAT_DATA_DIR=Join-Path $env:TEMP ('chat-test-' + [guid]::NewGuid())
npm start
```

En otra terminal, desde la misma carpeta:

```powershell
node tests/nine-retos.cjs
node tests/integration.cjs
```

Detener/reiniciar el servidor en la primera terminal sin cambiar CHAT_DATA_DIR, y ejecutar en la segunda:

```powershell
node tests/nine-retos.cjs --restart
node tests/integration.cjs --restart
```

Los scripts crean usuarios y conversaciones ficticios. No ejecutarlos contra el servidor con tus datos reales. El directorio de datos y los fixtures de sesiones están excluidos de Git.


## Privados, diálogos y sesión recordada
- Pulsar cualquier parte de la fila de una persona abre el chat privado. El encabezado indica el destinatario y hay un botón para volver a la sala.
- Usuarios en línea aparecen primero. Los desconectados permiten consultar historial; el envío queda deshabilitado hasta que vuelvan.
- Editar y eliminar usan ventanas integradas con Cancelar y confirmación, sin avisos nativos del navegador.
- El token activo permanece en sessionStorage y los perfiles recuperables se guardan en localStorage. Al cerrar/reabrir el navegador, se recupera el último perfil guardado. Al introducir un nombre ya guardado en ese navegador se reutiliza su token; el servidor nunca autentica solo por nombre.
- Una sesión admite un cliente simultáneo. Para probar varias personas en el mismo navegador, ingresar otro nombre en la segunda pestaña cuando se indique que la sesión ya está abierta.
- Los datos del navegador pertenecen a cada origen: localhost y una URL de túnel son distintos. Cambiar URL/navegador, borrar almacenamiento o vencer la sesión puede requerir un ingreso nuevo. Los registros duplicados anteriores no se fusionan por nombre para evitar mezclar historiales privados.

Verificado en navegador: cierre/reapertura sin duplicar identidad; clic en fila del usuario y envío privado; cancelar eliminación, editar y eliminar con las nuevas ventanas.
