# Nueve retos implementados y verificados

Se completaron los nueve retos del laboratorio, identificados en el código con comentarios // ------- Reto N: ... -------. Ver docs/RETOS.md y docs/protocol.md para ubicación, demostración y contratos.

## Verificaciones ejecutadas
- Sintaxis de todos los módulos activos: sin errores.
- Retos 1 a 3: escritura en sala y privado, límite de frecuencia, expiración, limpieza al salir; confirmaciones reales y sin duplicados, exclusión del autor y usuarios posteriores; agregar/quitar reacciones y validar emoji.
- Privacidad de escritura, reacciones y confirmaciones; terceros rechazados.
- Retos anteriores: mensajes, deduplicación, permisos, aislamiento de salas, citas sincronizadas con edición/eliminación, privados, última conexión y recuperación de sesión/sala.
- Reinicio real del servidor: se recuperaron identidad, sala, historial privado, citas, reacciones y confirmaciones persistidas.
- Navegador real con dos pestañas: indicador de escritura visible, reacción sincronizada y transición Recibido (otra conversación abierta) a Leído (al abrir la sala).

## Pruebas reproducibles
Usar un directorio temporal NUEVO mediante CHAT_DATA_DIR y PORT=43190. Ejecutar node tests/nine-retos.cjs y node tests/integration.cjs. Reiniciar servidor con el mismo directorio y ejecutar ambos con --restart. Los fixtures guardan tokens de prueba y están excluidos de Git. Nunca usar datos reales para estos scripts.

## Pendiente externo
No se realizó la prueba del túnel/celular. No se generaron informes PDF ni ZIP. No se modificó WebRPC_Videollamada.
