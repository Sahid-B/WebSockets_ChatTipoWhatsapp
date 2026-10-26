import { fileURLToPath } from "node:url";
// Configuración del servidor. Lee valores del entorno con valores seguros.
// Puerto predeterminado 3000, configurable mediante variable de entorno PORT.
export const PORT = Number(process.env.PORT) || 3000;
// Ruta del directorio público servido por Express.
export const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
// Longitud máxima permitida para el nombre de usuario (carácteres).
export const MAX_NAME_LENGTH = 24;
// Longitud máxima permitida para el contenido de un mensaje.
export const MAX_MESSAGE_LENGTH = 1000;
// Versión del protocolo, usada en session:welcome.
export const PROTOCOL_VERSION = 1;