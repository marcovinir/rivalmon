import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS } from "../../src/http/limits.js";
import { MemoryMailer } from "../../src/mail/memory-mailer.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";

const mailer = new MemoryMailer();
const { app, tokens } = buildTestContext({ EMAIL_CODES: "on", MAIL_PROVIDER: "memory" }, { mailer });
const off = buildTestContext({ EMAIL_CODES: "off" }).app;
const ash = { email: "ash@example.com", username: "ash", password: "pikachu-123" };
const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];

beforeEach(async () => {
  await resetDatabase();
  mailer.clear();
  mailer.failWith = null;
});
afterAll(() => prisma.$disconnect());

async function register(target = app, user = ash): Promise<{ token: string; cookie: string }> {
  const response = await request(target).post("/auth/register").send(user);
  expect(response.status).toBe(201);
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return { token: response.body.accessToken as string, cookie: cookies.find((one) => one.startsWith("refresh_token="))! };
}

/** El código del último correo enviado a esa dirección. */
function lastCode(address = ash.email): string {
  const mail = mailer.to(address).at(-1);
  if (!mail) throw new Error(`No llegó ningún correo a ${address}`);
  return /\b(\d{6})\b/.exec(mail.text)![1]!;
}

const me = async (token: string) => (await request(app).get("/auth/me").set(...bearer(token))).body.user;

describe("con el interruptor apagado", () => {
  it("options lo dice y las rutas de los códigos no existen", async () => {
    expect((await request(off).get("/auth/options")).body).toEqual({ emailCodes: false });
    const { token } = await register(off);
    expect((await request(off).post("/auth/verification/send").set(...bearer(token))).status).toBe(404);
    expect((await request(off).post("/auth/verification/confirm").set(...bearer(token)).send({ code: "123456" })).status).toBe(404);
    expect((await request(off).post("/auth/password/forgot").send({ email: ash.email })).status).toBe(404);
    expect((await request(off).post("/auth/password/reset").send({ email: ash.email, code: "123456", password: "nueva-clave-1" })).status).toBe(404);
  });
});

describe("verificar el correo desde la cuenta", () => {
  it("options lo dice; una cuenta nueva nace sin verificar y verifica con el código", async () => {
    expect((await request(app).get("/auth/options")).body).toEqual({ emailCodes: true });
    const { token } = await register();
    expect(await me(token)).toMatchObject({ emailVerified: false });
    expect((await request(app).post("/auth/verification/send").set(...bearer(token))).status).toBe(202);
    const confirm = await request(app).post("/auth/verification/confirm").set(...bearer(token)).send({ code: lastCode() });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toEqual({ emailVerified: true });
    expect(await me(token)).toMatchObject({ emailVerified: true });
  });

  it("un código equivocado o mal formado no verifica", async () => {
    const { token } = await register();
    await request(app).post("/auth/verification/send").set(...bearer(token));
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    expect((await request(app).post("/auth/verification/confirm").set(...bearer(token)).send({ code: wrong })).body.error.code).toBe("INVALID_CODE");
    expect((await request(app).post("/auth/verification/confirm").set(...bearer(token)).send({ code: "12a" })).status).toBe(400);
    expect(await me(token)).toMatchObject({ emailVerified: false });
  });

  it("un invitado no puede pedirlo: 403 y no se envía nada", async () => {
    const guest = tokens.signAccessToken({ sub: "guest_abc", username: "inv_1", guest: true });
    const response = await request(app).post("/auth/verification/send").set(...bearer(guest));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_REQUIRED");
    expect(mailer.sent).toHaveLength(0);
  });

  it("ya verificado: 202 y no se envía otro correo", async () => {
    const { token } = await register();
    await request(app).post("/auth/verification/send").set(...bearer(token));
    await request(app).post("/auth/verification/confirm").set(...bearer(token)).send({ code: lastCode() });
    mailer.clear();
    expect((await request(app).post("/auth/verification/send").set(...bearer(token))).status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it("si el proveedor falla, 502 EMAIL_SEND_FAILED", async () => {
    const { token } = await register();
    mailer.failWith = new Error("caído");
    const response = await request(app).post("/auth/verification/send").set(...bearer(token));
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("EMAIL_SEND_FAILED");
  });

  it("verificar no cambia nada más: el registro y el login siguen como siempre", async () => {
    await register();
    const login = await request(app).post("/auth/login").send({ email: ash.email, password: ash.password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ emailVerified: false });
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("olvidé mi contraseña", () => {
  /** Lo que un curioso vería: estado y cuerpo. */
  const forgot = async (email: string) => {
    const response = await request(app).post("/auth/password/forgot").send({ email });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { status: response.status, body: response.body };
  };

  it("responde igual con y sin cuenta, y solo envía si existe; con mayúsculas y espacios la encuentra", async () => {
    await register();
    const withAccount = await forgot("  ASH@Example.com ");
    const without = await forgot("nadie@example.com");
    expect(withAccount).toEqual(without);
    expect(withAccount.status).toBe(202);
    expect(mailer.to(ash.email)).toHaveLength(1);
    expect(mailer.to("nadie@example.com")).toHaveLength(0);
  });

  it("una cuenta borrada no recibe nada", async () => {
    const { token } = await register();
    expect((await request(app).delete("/auth/me").set(...bearer(token)).send({ password: ash.password })).status).toBe(204);
    expect((await forgot(ash.email)).status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it("restablecer cambia la contraseña, cierra las sesiones abiertas y verifica el correo", async () => {
    const { cookie } = await register();
    await forgot(ash.email);
    const reset = await request(app).post("/auth/password/reset").send({ email: ash.email, code: lastCode(), password: "nueva-clave-1" });
    expect(reset.status).toBe(204);
    expect((await request(app).post("/auth/refresh").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: ash.email, password: ash.password })).status).toBe(401);
    const login = await request(app).post("/auth/login").send({ email: ash.email, password: "nueva-clave-1" });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ emailVerified: true });
  });

  it("el código sirve una sola vez", async () => {
    await register();
    await forgot(ash.email);
    const code = lastCode();
    expect((await request(app).post("/auth/password/reset").send({ email: ash.email, code, password: "nueva-clave-1" })).status).toBe(204);
    const again = await request(app).post("/auth/password/reset").send({ email: ash.email, code, password: "otra-clave-22" });
    expect(again.body.error.code).toBe("INVALID_CODE");
  });

  it("un código de verificar no sirve para restablecer, ni al revés", async () => {
    const { token } = await register();
    await request(app).post("/auth/verification/send").set(...bearer(token));
    const verifyCode = lastCode();
    const reset = await request(app).post("/auth/password/reset").send({ email: ash.email, code: verifyCode, password: "nueva-clave-1" });
    expect(reset.body.error.code).toBe("INVALID_CODE");
    await forgot(ash.email);
    const resetCode = lastCode();
    const confirm = await request(app).post("/auth/verification/confirm").set(...bearer(token)).send({ code: resetCode });
    if (resetCode !== verifyCode) expect(confirm.body.error.code).toBe("INVALID_CODE");
  });

  it("una contraseña nueva demasiado corta se rechaza sin gastar el código", async () => {
    await register();
    await forgot(ash.email);
    const code = lastCode();
    expect((await request(app).post("/auth/password/reset").send({ email: ash.email, code, password: "corta" })).body.error.code).toBe("VALIDATION_ERROR");
    expect((await request(app).post("/auth/password/reset").send({ email: ash.email, code, password: "nueva-clave-1" })).status).toBe(204);
  });
});

describe("los límites", () => {
  const limited = buildTestContext({ EMAIL_CODES: "on", MAIL_PROVIDER: "memory" }, { mailer: new MemoryMailer(), rateLimits: DEFAULT_RATE_LIMITS }).app;

  it("un segundo código al mismo correo antes de 60 s espera", async () => {
    expect((await request(limited).post("/auth/password/forgot").send({ email: "x@example.com" })).status).toBe(202);
    const second = await request(limited).post("/auth/password/forgot").send({ email: "x@example.com" });
    expect(second.status).toBe(429);
    expect(Number(second.headers["retry-after"])).toBeGreaterThan(0);
  });
});
