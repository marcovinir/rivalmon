/** Las reglas de los códigos que llegan por correo (spec de la etapa 7 y de la #64). */

/** Dígitos de un código. */
export const CODE_LENGTH = 6;

/** Cuánto vale un código desde que se envía. */
export const CODE_TTL_MINUTES = 10;
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;

/** Intentos que admite un código antes de bloquearse; la base de datos lo exige también. */
export const MAX_CODE_ATTEMPTS = 5;
