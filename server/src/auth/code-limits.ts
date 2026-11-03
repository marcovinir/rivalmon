import type { KeyedLimiter, LimitCheck } from "../http/rate-limit.js";

/** Los cinco limitadores de los códigos por correo (se crean en app.ts a partir de la configuración de límites). */
export interface CodeLimiters {
  cooldown: KeyedLimiter;
  sendsByEmail: KeyedLimiter;
  sendsByIp: KeyedLimiter;
  /** Uno solo para todo el sitio (clave fija). */
  sendsDaily: KeyedLimiter;
  failuresByEmail: KeyedLimiter;
  failuresByIp: KeyedLimiter;
}

/**
 * Cómo usan las rutas los límites: el hueco se **reserva antes de hacer el trabajo** y se devuelve si falla por algo nuestro,
 * como en el login. `reserve*` da `null` si cabe o los segundos de espera (la mayor si aplican varios límites).
 * Las claves son el correo y la IP, nunca si existe una cuenta: así el límite no delata qué correos están registrados.
 */
export interface CodeLimits {
  /** Un envío de código (verificar el correo u olvidé la contraseña). */
  reserveSend(ip: string, email: string): number | null;
  releaseSend(ip: string, email: string): void;
  /** Una comprobación de código (verificar o restablecer): se cuenta como fallo hasta que se demuestre lo contrario. */
  reserveFailure(ip: string, email: string): number | null;
  /** El código era correcto: se reinicia la cuenta del correo y se devuelve el hueco de la IP. */
  forgiveFailure(ip: string, email: string): void;
  /** La comprobación falló por algo nuestro y no cuenta como fallo de quien escribió el código. */
  releaseFailure(ip: string, email: string): void;
}

/** La clave única del tope diario de todo el sitio. */
const SITE = "sitio";

function longestWait(checks: LimitCheck[]): number | null {
  const waits = checks.flatMap((check) => (check.allowed ? [] : [check.retryAfterSeconds]));
  return waits.length > 0 ? Math.max(...waits) : null;
}

/** Sin limitadores (desarrollo y pruebas) nada se reserva ni se rechaza. */
export function createCodeLimits(limiters?: CodeLimiters): CodeLimits {
  if (!limiters) {
    return { reserveSend: () => null, releaseSend() {}, reserveFailure: () => null, forgiveFailure() {}, releaseFailure() {} };
  }
  const { cooldown, sendsByEmail, sendsByIp, sendsDaily, failuresByEmail, failuresByIp } = limiters;
  return {
    reserveSend(ip, email) {
      const wait = longestWait([cooldown.check(email), sendsByEmail.check(email), sendsByIp.check(ip), sendsDaily.check(SITE)]);
      if (wait !== null) return wait;
      cooldown.record(email);
      sendsByEmail.record(email);
      sendsByIp.record(ip);
      sendsDaily.record(SITE);
      return null;
    },
    releaseSend(ip, email) {
      cooldown.release(email);
      sendsByEmail.release(email);
      sendsByIp.release(ip);
      sendsDaily.release(SITE);
    },
    reserveFailure(ip, email) {
      const wait = longestWait([failuresByEmail.check(email), failuresByIp.check(ip)]);
      if (wait !== null) return wait;
      failuresByEmail.record(email);
      failuresByIp.record(ip);
      return null;
    },
    forgiveFailure(ip, email) {
      failuresByEmail.reset(email);
      failuresByIp.release(ip);
    },
    releaseFailure(ip, email) {
      failuresByEmail.release(email);
      failuresByIp.release(ip);
    },
  };
}
