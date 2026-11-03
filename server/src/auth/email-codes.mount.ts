import { Router } from "express";
import type { Env } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import type { RateLimitConfig } from "../http/limits.js";
import { createKeyedLimiter } from "../http/rate-limit.js";
import type { Mailer } from "../mail/mailer.js";
import { MemoryMailer } from "../mail/memory-mailer.js";
import { createRequireAccount } from "./auth.middleware.js";
import { createCodeLimits } from "./code-limits.js";
import { EmailCodeStore, createCodeHasher } from "./email-codes.js";
import { EmailCodesService } from "./email-codes.service.js";
import { createPasswordHasher } from "./password.js";
import { createRecoveryRouter } from "./recovery.routes.js";
import type { TokenService } from "./tokens.js";

export interface EmailCodesMountDeps {
  env: Env;
  prisma: PrismaClient;
  tokens: TokenService;
  mailer: Mailer;
  /** Los límites de producción; nulos en las pruebas que los apagan. */
  limits: RateLimitConfig | null;
}

/**
 * Lo que se monta bajo /auth para los códigos por correo (#64). `GET /auth/options` existe siempre; el resto, solo con
 * `EMAIL_CODES=on`: apagado, esas rutas dan el 404 de siempre.
 */
export function createEmailCodesRouter({ env, prisma, tokens, mailer, limits }: EmailCodesMountDeps): Router {
  const router = Router();
  router.get("/options", (_req, res) => {
    res.json({ emailCodes: env.EMAIL_CODES });
  });
  if (!env.EMAIL_CODES) return router;

  const codeLimits = createCodeLimits(
    limits
      ? {
          cooldown: createKeyedLimiter({ ...limits.codeCooldown, now: limits.now }),
          sendsByEmail: createKeyedLimiter({ ...limits.codeSendsByEmail, now: limits.now }),
          sendsByIp: createKeyedLimiter({ ...limits.codeSendsByIp, now: limits.now }),
          sendsDaily: createKeyedLimiter({ ...limits.codeSendsDaily, now: limits.now }),
          failuresByEmail: createKeyedLimiter({ ...limits.codeFailuresByEmail, now: limits.now }),
          failuresByIp: createKeyedLimiter({ ...limits.codeFailuresByIp, now: limits.now }),
        }
      : undefined,
  );
  const service = new EmailCodesService({
    prisma,
    codes: new EmailCodeStore({ prisma, hash: createCodeHasher(env.JWT_ACCESS_SECRET) }),
    mailer,
    hasher: createPasswordHasher(env.BCRYPT_COST),
  });
  router.use(createRecoveryRouter({ service, codeLimits, requireAccount: createRequireAccount(tokens) }));

  // El buzón que lee la E2E: solo con el correo en memoria y, en producción, con ALLOW_MEMORY_MAIL. Si no, no existe.
  if (mailer instanceof MemoryMailer && env.MAIL_PROVIDER === "memory" && (env.NODE_ENV !== "production" || env.ALLOW_MEMORY_MAIL)) {
    router.get("/test-outbox", (req, res) => {
      const to = typeof req.query.to === "string" ? req.query.to : "";
      if (to === "") throw new AppError(400, "VALIDATION_ERROR", "Falta el correo (to)");
      res.json({ messages: mailer.to(to).map(({ subject, text, to: address }) => ({ to: address, subject, text })) });
    });
  }
  return router;
}
