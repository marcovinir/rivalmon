import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEmailCodesRouter } from "../../src/auth/email-codes.mount.js";
import { createTokenService } from "../../src/auth/tokens.js";
import { type Env, loadEnv } from "../../src/config/env.js";
import { errorHandler } from "../../src/http/errors.js";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { ConsoleMailer } from "../../src/mail/console-mailer.js";
import type { Mailer } from "../../src/mail/mailer.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const base = loadEnv(process.env);
const tokens = createTokenService({ secret: base.JWT_ACCESS_SECRET, accessTtlSeconds: 60 });

/** Solo el router de los códigos, con la configuración que se quiera: así se prueba cuándo existe el buzón. */
function mountWith(env: Partial<Env>, mailer: Mailer = new MemoryMailer()) {
  const app = express();
  app.use(express.json());
  app.use("/auth", createEmailCodesRouter({ env: { ...base, ...env } as Env, prisma, tokens, mailer, limits: null }));
  app.use(errorHandler);
  return app;
}

describe("el buzón de pruebas /auth/test-outbox", () => {
  const outbox = (app: express.Express) => request(app).get("/auth/test-outbox?to=a@example.com");

  it("existe en las pruebas con el correo en memoria", async () => {
    expect((await outbox(mountWith({ EMAIL_CODES: true, MAIL_PROVIDER: "memory", NODE_ENV: "test" }))).status).toBe(200);
  });

  it("no existe en producción con memoria si no se permite expresamente", async () => {
    expect((await outbox(mountWith({ EMAIL_CODES: true, MAIL_PROVIDER: "memory", NODE_ENV: "production", ALLOW_MEMORY_MAIL: false }))).status).toBe(404);
  });

  it("no existe con otro proveedor ni con el interruptor apagado", async () => {
    expect((await outbox(mountWith({ EMAIL_CODES: true, MAIL_PROVIDER: "console", NODE_ENV: "development" }, new ConsoleMailer()))).status).toBe(404);
    expect((await outbox(mountWith({ EMAIL_CODES: false, MAIL_PROVIDER: "memory", NODE_ENV: "test" }))).status).toBe(404);
  });
});

describe("los límites de envío", () => {
  it("si el proveedor falla, el envío no cuenta y se puede reintentar enseguida", async () => {
    const mailer = new MemoryMailer();
    const { app } = buildTestContext({ EMAIL_CODES: "on", MAIL_PROVIDER: "memory" }, { mailer, rateLimits: DEFAULT_RATE_LIMITS });
    const token = (await request(app).post("/auth/register").send({ email: "ash@example.com", username: "ash", password: "pikachu-123" })).body.accessToken as string;
    mailer.failWith = new Error("caído");
    expect((await request(app).post("/auth/verification/send").set("Authorization", `Bearer ${token}`)).status).toBe(502);
    mailer.failWith = null;
    expect((await request(app).post("/auth/verification/send").set("Authorization", `Bearer ${token}`)).status).toBe(202);
  });

  it("hay un tope diario para todo el sitio, por debajo de la cuota gratuita del proveedor", async () => {
    let now = 0;
    const limits = { ...DEFAULT_RATE_LIMITS, codeSendsByIp: { limit: 1000, windowMs: 3_600_000 }, now: () => now };
    const { app } = buildTestContext({ EMAIL_CODES: "on", MAIL_PROVIDER: "memory" }, { mailer: new MemoryMailer(), rateLimits: limits });
    const statuses: number[] = [];
    for (let i = 0; i < DEFAULT_RATE_LIMITS.codeSendsDaily.limit + 1; i++) {
      now += 61_000;
      statuses.push((await request(app).post("/auth/password/forgot").send({ email: `n${i}@example.com` })).status);
    }
    expect(DEFAULT_RATE_LIMITS.codeSendsDaily.limit).toBeLessThan(100);
    expect(statuses.slice(0, -1).every((status) => status === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("cuentas borradas y verificadas", () => {
  const mailer = new MemoryMailer();
  const { app } = buildTestContext({ EMAIL_CODES: "on", MAIL_PROVIDER: "memory" }, { mailer });
  const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };

  it("borrar la cuenta borra sus códigos y su verificación", async () => {
    const { body } = await request(app).post("/auth/register").send(ash);
    await request(app).post("/auth/verification/send").set("Authorization", `Bearer ${body.accessToken}`);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerifiedAt: new Date() } });
    await request(app).delete("/auth/me").set("Authorization", `Bearer ${body.accessToken}`).send({ password: ash.password });
    expect(await prisma.emailCode.count({ where: { userId: body.user.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } })).emailVerifiedAt).toBeNull();
  });

  it("si ya estaba verificada, enviar lo dice para que la pantalla se ponga al día", async () => {
    const { body } = await request(app).post("/auth/register").send(ash);
    await prisma.user.update({ where: { id: body.user.id }, data: { emailVerifiedAt: new Date() } });
    const response = await request(app).post("/auth/verification/send").set("Authorization", `Bearer ${body.accessToken}`);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ ok: true, alreadyVerified: true });
  });
});
