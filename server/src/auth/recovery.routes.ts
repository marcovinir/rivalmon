import { type Request, type RequestHandler, type Response, Router } from "express";
import { AppError } from "../http/errors.js";
import { tooManyRequests } from "../http/rate-limit.js";
import { getAuth } from "./auth.middleware.js";
import { codeOnlySchema, emailOnlySchema, resetPasswordSchema } from "./auth.schemas.js";
import type { CodeLimits } from "./code-limits.js";
import type { EmailCodesService } from "./email-codes.service.js";

export const SEND_LIMIT_MESSAGE = "Pediste demasiados códigos. Inténtalo de nuevo más tarde.";
const CHECK_LIMIT_MESSAGE = "Demasiados intentos con el código. Inténtalo de nuevo más tarde.";

const clientIp = (req: Request): string => req.ip ?? "desconocida";

/** Si el límite no deja pasar, 429 con la espera en el cuerpo y en `Retry-After`. */
export function rejectWhenBlocked(res: Response, wait: number | null, message: string): void {
  if (wait === null) return;
  res.set("Retry-After", String(wait));
  throw tooManyRequests(wait, message);
}

/** Un fallo en una tarea de segundo plano (nadie espera su respuesta): se anota sin dirección ni código. */
export function logBackgroundFailure(error: unknown): void {
  console.error(`[correo] Falló una tarea en segundo plano: ${error instanceof Error ? error.name : "error desconocido"}`);
}

const isInvalidCode = (error: unknown): boolean => error instanceof AppError && error.code === "INVALID_CODE";
const isSendFailure = (error: unknown): boolean => error instanceof AppError && error.code === "EMAIL_SEND_FAILED";

export interface RecoveryRouterDeps {
  service: EmailCodesService;
  codeLimits: CodeLimits;
  requireAccount: RequestHandler;
}

/**
 * Los códigos por correo (#64). Solo se monta con `EMAIL_CODES=on`.
 * `forgot` contesta siempre lo mismo y **antes** de buscar la cuenta y enviar: ni el cuerpo ni el tiempo de respuesta delatan
 * si el correo existe, y sus límites dependen del correo y la IP, nunca de la cuenta.
 */
export function createRecoveryRouter({ service, codeLimits, requireAccount }: RecoveryRouterDeps): Router {
  const router = Router();

  /** Comprueba un código con su intento reservado antes: si no, los intentos en paralelo pasarían todos con la cuenta a cero. */
  async function checkCode(res: Response, ip: string, email: string, work: () => Promise<void>): Promise<void> {
    rejectWhenBlocked(res, codeLimits.reserveFailure(ip, email), CHECK_LIMIT_MESSAGE);
    try {
      await work();
    } catch (error) {
      // Un fallo nuestro (la base de datos, p. ej.) no es un intento fallido de quien escribió el código.
      if (!isInvalidCode(error)) codeLimits.releaseFailure(ip, email);
      throw error;
    }
    codeLimits.forgiveFailure(ip, email);
  }

  router.post("/verification/send", requireAccount, async (req, res) => {
    const { userId } = getAuth(res);
    const email = await service.emailOf(userId);
    const ip = clientIp(req);
    rejectWhenBlocked(res, codeLimits.reserveSend(ip, email), SEND_LIMIT_MESSAGE);
    let result: { alreadyVerified: boolean };
    try {
      result = await service.sendVerification(userId);
    } catch (error) {
      // Si el proveedor falló, el envío no cuenta: se puede reintentar enseguida.
      if (isSendFailure(error)) codeLimits.releaseSend(ip, email);
      throw error;
    }
    res.status(202).json(result.alreadyVerified ? { ok: true, alreadyVerified: true } : { ok: true });
  });

  router.post("/verification/confirm", requireAccount, async (req, res) => {
    // El formato se valida antes de tocar los límites: un código mal escrito no gasta ningún intento.
    const { code } = codeOnlySchema.parse(req.body);
    const { userId } = getAuth(res);
    await checkCode(res, clientIp(req), await service.emailOf(userId), () => service.confirmVerification(userId, code));
    res.json({ emailVerified: true });
  });

  router.post("/password/forgot", (req, res) => {
    const { email } = emailOnlySchema.parse(req.body);
    rejectWhenBlocked(res, codeLimits.reserveSend(clientIp(req), email), SEND_LIMIT_MESSAGE);
    void service.requestPasswordReset(email).catch(logBackgroundFailure);
    res.status(202).json({ ok: true });
  });

  router.post("/password/reset", async (req, res) => {
    // La contraseña nueva también se valida antes de reservar el intento: una demasiado corta no gasta el código.
    const input = resetPasswordSchema.parse(req.body);
    await checkCode(res, clientIp(req), input.email, () => service.resetPassword(input));
    res.status(204).end();
  });

  return router;
}
