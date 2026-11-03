# Olvidé mi contraseña y verificar el correo: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (método preferido por Marco) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** recuperar la contraseña con un código por correo y verificar el correo desde el perfil, sin bloquear nada, todo detrás de `EMAIL_CODES`.

**Architecture:** se recupera el código de la etapa 7 (`git show 67c1e77:<ruta>`) y se adapta. Se quitan la verificación obligatoria y las cuentas pendientes, y la verificación pasa a dos rutas con sesión. El correo sale por la interfaz `Mailer` (Resend en producción, memoria en pruebas).

**Tech Stack:** Express 5, Prisma 7.10.0, PostgreSQL 18, React 19, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-cuentas-correo-design.md` (y la de la etapa 7 donde esta remite).

## Global Constraints

- Migración solo aditiva, nueva: `server/prisma/migrations/20261103000000_email_codes/`. Nunca se toca `20261007230000_email_verification_codes` ni `20261020000000_remove_email_verification`.
- `email_verified_at` queda nulo para todas las cuentas existentes: sin relleno.
- Interruptor `EMAIL_CODES=on|off`, por defecto `off`: apagado, ninguna ruta nueva se monta salvo `GET /auth/options`, y nada visible cambia.
- Remitente de ejemplo: `Rivalmon <no-responder@mail.marcovinir.dev>`. Ninguna clave en el repositorio.
- Códigos: 6 dígitos, `CODE_TTL` 10 min, `MAX_CODE_ATTEMPTS` 5, un solo uso, un código vigente por cuenta y propósito.
- Ninguna ruta, ni el login ni el registro, exige el correo verificado.
- Textos en español con tildes.

## Review Focus

1. Correo con mayúsculas o espacios en `/olvide`: se normaliza igual que en el registro y el login, y encuentra la cuenta.
2. Pedir verificación siendo invitado (sesión de invitado): `403 ACCOUNT_REQUIRED`, sin enviar nada.
3. Cuenta borrada (`borrada-<id>@invalid`): `forgot` responde 202 y no envía nada.
4. Restablecer la contraseña con la sesión abierta en otro dispositivo: sus tokens de renovación quedan revocados.
5. Correo ya verificado que vuelve a pulsar «Verificar»: `202` sin enviar, y la pantalla ya dice «Verificado».

---

### Task 1: Configuración, errores y servicio de correo

**Files:**
- Recuperar de `67c1e77` y adaptar: `server/src/mail/{mailer,console-mailer,memory-mailer,resend-mailer,create-mailer,templates}.ts` y sus pruebas en `server/test/mail/`.
- Modificar: `server/src/config/env.ts`, `server/.env.example`, `render.yaml`, `shared/src/errors.ts`, `server/test/config/mail-env.test.ts`, `server/test/deploy/config-files.test.ts`, `server/test/shared/contract.test.ts`.

**Interfaces:**
- Produces: `env.emailCodes: boolean`, `env.mailProvider: "resend" | "console" | "memory"`, `createMailer(env): Mailer`, `ErrorCode` con `INVALID_CODE` (400) y `EMAIL_SEND_FAILED` (502). Sin `EMAIL_NOT_VERIFIED`.

- [ ] **Step 1:** recuperar las pruebas (`git show 67c1e77:server/test/mail/...` y `.../config/mail-env.test.ts`). Renombrar `EMAIL_VERIFICATION` a `EMAIL_CODES`, cambiar el remitente de ejemplo y dejar los textos de las plantillas con «Rivalmon». Añadir a `config-files.test.ts` que `render.yaml` declara `RESEND_API_KEY` y `MAIL_FROM` con `sync: false` y `EMAIL_CODES` con `off`.
- [ ] **Step 2:** ejecutar `cd server && npx vitest run test/mail test/config test/deploy test/shared`. Esperado: falla porque los módulos no existen.
- [ ] **Step 3:** recuperar y adaptar el código. Reglas de producción como en la etapa 7, §4.9, con el nombre nuevo.
- [ ] **Step 4:** ejecutar de nuevo. Esperado: pasa. Commit `feat: servicio de correo y configuración EMAIL_CODES (#64)`.

### Task 2: Migración y códigos

**Files:**
- Crear: `server/prisma/migrations/20261103000000_email_codes/migration.sql`.
- Modificar: `server/prisma/schema.prisma`.
- Recuperar y adaptar: `server/src/auth/{email-codes,code-policy}.ts`, `server/test/auth/{email-codes,code-policy}.test.ts`, `server/test/db/email-codes.test.ts`.
- Crear prueba: `server/test/db/migration-email-codes.test.ts`.

**Interfaces:**
- Produces: `issueCode(userId, purpose): Promise<string>`, `consumeCode(tx, userId, purpose, code, now): Promise<boolean>` con la reserva atómica de la etapa 7, §4.3, y `User.emailVerifiedAt: Date | null`.

- [ ] **Step 1:** pruebas recuperadas, más una de migración que comprueba que las cuentas existentes quedan con `email_verified_at` nulo y conservan sus datos.
- [ ] **Step 2:** ejecutar `npm run db:generate -w server && cd server && npx vitest run test/auth/email-codes.test.ts test/db`. Esperado: falla.
- [ ] **Step 3:** el SQL crea el enum, la columna nula **sin relleno** y la tabla, igual que la migración de la etapa 7 pero sin el `UPDATE`.
- [ ] **Step 4:** pasa, incluida la de 20 intentos en paralelo que gastan como máximo 5. Commit `feat: migración aditiva y códigos de un solo uso (#64)`.

### Task 3: Rutas, servicio y límites

**Files:**
- Modificar: `server/src/auth/{auth.routes,auth.service,auth.schemas}.ts`, `server/src/app.ts`, `server/src/http/limits.ts`.
- Recuperar y adaptar: `server/src/auth/{code-limits,recovery.routes}.ts`, `server/test/http/code-limits.test.ts`, `server/test/auth/auth.recovery.test.ts`.
- Crear prueba: `server/test/auth/auth.verification-optional.test.ts`.

**Interfaces:**
- Consumes: `issueCode`, `consumeCode` y `createMailer`.
- Produces: `GET /auth/options → { emailCodes }`; `POST /auth/verification/send`; `POST /auth/verification/confirm { code } → { emailVerified: true }`; `POST /auth/password/forgot`; `POST /auth/password/reset`; y `UserDto.emailVerified: boolean`.

- [ ] **Step 1:** pruebas:
  - Con `EMAIL_CODES=off` las rutas dan 404 y `options` dice `false`.
  - Enviar y confirmar desde la cuenta deja `emailVerified: true` en `/auth/me`.
  - Un invitado recibe `403 ACCOUNT_REQUIRED` (foco 2).
  - Ya verificado: `202` sin mensaje en el buzón (foco 5).
  - `forgot` responde igual con y sin cuenta, con mayúsculas y espacios (foco 1), y con una cuenta borrada (foco 3).
  - `reset` cambia la contraseña, revoca los tokens de renovación (foco 4) y verifica el correo.
  - Un código de `verify_email` no sirve para `reset_password`, ni al revés.
  - Registro, login y refresh responden exactamente como antes con el interruptor encendido.
  - Los límites de la etapa 7, §4.7.
- [ ] **Step 2:** ejecutar `cd server && npx vitest run test/auth test/http`. Esperado: falla.
- [ ] **Step 3:** adaptar el servicio de la etapa 7 sin cuentas pendientes ni `EMAIL_NOT_VERIFIED`. El buzón de pruebas `GET /auth/test-outbox`, como en la etapa 7, §4.10.
- [ ] **Step 4:** ejecutar la suite completa del servidor. Esperado: pasa. Commit `feat: rutas de recuperación y verificación opcional (#64)`.

### Task 4: Cliente

**Files:**
- Modificar: `client/src/api/{endpoints,types}.ts`, `client/src/routes.tsx`, `client/src/i18n/es.ts`, `client/src/pages/{AuthPages,AuthCard}.tsx`, `client/src/pages/describe-error.ts`, la página de perfil propio y `client/test/helpers/services.tsx`.
- Recuperar y adaptar: `client/src/pages/{PasswordRecoveryPages.tsx,use-cooldown.ts}`, `client/src/components/CodeField.tsx`, `client/src/session/auth-options.ts` y sus pruebas.
- Crear prueba: `client/test/pages/profile-email.test.tsx`.

- [ ] **Step 1:** pruebas:
  - `/olvide` y `/restablecer`, recuperadas.
  - El enlace «¿Olvidaste tu contraseña?» solo con `emailCodes`.
  - En el perfil propio, la fila «Correo» con «Verificar», el campo de código, «Reenviar código» con su espera y «Verificado» al acertar.
  - En el perfil ajeno, ni el correo ni la fila.
  - Con el interruptor apagado, todo como hoy.
- [ ] **Step 2:** ejecutar `cd client && npx vitest run --maxWorkers=2`. Esperado: fallan las nuevas.
- [ ] **Step 3:** implementar, con los componentes del rediseño.
- [ ] **Step 4:** pasa la suite del cliente y `npm run typecheck`. Commit `feat: pantallas de recuperación y verificación en el perfil (#64)`.

### Task 5: E2E, documentación y cierre

**Files:**
- Modificar: `e2e/global-setup.ts`, para que el servidor arranque con `EMAIL_CODES=on`, `MAIL_PROVIDER=memory` y `ALLOW_MEMORY_MAIL=true`, y `e2e/support/app.ts`, con un ayudante que lee el buzón.
- Crear: `e2e/tests/accounts.spec.ts`, `docs/correo.md` (recuperada, con `mail.marcovinir.dev`).
- Modificar: `docs/despliegue.md`, `docs/guia-tecnica.md` y los dos README.

- [ ] **Step 1:** E2E:
  - Olvidé mi contraseña completo, entrando después con la nueva.
  - Verificar desde el perfil.
  - Bloqueo tras 5 códigos malos.
  - A 360 px caben las pantallas nuevas y la fila del perfil, con un nombre de 30 letras.
- [ ] **Step 2:** `E2E_CHANNEL=msedge npm run e2e`. Esperado: todas pasan.
- [ ] **Step 3:** mutaciones: contador de intentos, uso único, revocación de sesiones, igualdad de respuestas, vencimiento y la regla que prohíbe la consola en producción. Esperado: todas detectadas.
- [ ] **Step 4:** revisión final independiente, con foco en seguridad y en la lista de arriba. Arreglos con TDD.
- [ ] **Step 5:** PR con `Closes #64`, que nombra la migración `20261103000000_email_codes`. La fusión la autoriza Marco. Después, guiarle con `docs/correo.md` para Resend y el DNS.
