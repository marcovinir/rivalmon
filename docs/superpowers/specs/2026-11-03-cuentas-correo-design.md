# Rivalmon: olvidé mi contraseña y verificar el correo

Issue #64. Fecha: 2026-11-03. **Pendiente de aprobación de Marco.**

Parte de la etapa 7 (`2026-10-07-etapa-7-cuentas-design.md`, código en `git diff a5beec0^ 67c1e77`), que se retiró en la #2. Esta spec manda donde difieren; lo que no dice, se toma de aquella.

## 1. Intención

Marco ya tiene dominio propio, marcovinir.dev. Con él se pueden enviar correos, y vuelven dos funciones:

- **Olvidé mi contraseña:** hoy quien la olvida pierde la cuenta.
- **Verificar el correo:** comprueba que el correo es tuyo y está bien escrito, para que la recuperación funcione. Más adelante será requisito del matchmaking.

## 2. Decisiones de Marco (2026-11-03)

- Olvidé mi contraseña, con un código por correo.
- Verificar el correo es **opcional y no bloquea nada**: se pide desde el perfil. Hoy cualquiera juega sin verificar, con cuenta o como invitado.
- Será obligatoria solo para el matchmaking, cuando exista. Ese proyecto va aparte.
- Remitente en un subdominio: `mail.marcovinir.dev`.
- Cambiar el correo desde el perfil queda para más adelante.

## 3. Lo que cambia respecto a la etapa 7

| Etapa 7 | Ahora |
|---|---|
| Verificar era obligatorio: sin verificar no había sesión | No bloquea nada: el registro, el login y `refresh` quedan como hoy |
| Las cuentas existentes se daban por verificadas | Quedan **sin verificar**, y cada uno lo hace cuando quiera |
| Cuentas pendientes que se reemplazaban o se borraban a las 24 h | No existen: toda cuenta es normal desde que se crea |
| Código al registrarse y al iniciar sesión sin verificar | Solo cuando la persona lo pide desde su perfil |
| `/verificar` como pantalla pública | Un recuadro en el perfil, con sesión |
| `EMAIL_NOT_VERIFIED` | No se usa |

Se mantiene: códigos de 6 dígitos, `Mailer` (Resend, consola, memoria), hash con clave, la reserva atómica de intentos, los límites, `/olvide` y `/restablecer`, el buzón de pruebas de la E2E, la configuración de producción y `docs/correo.md`.

## 4. Experiencia

- **Perfil propio, con el interruptor activo:** una fila «Correo» con su estado. Si está **sin verificar**, aparece el botón «Verificar». Al pulsarlo se envía un código y se abre en el mismo sitio el campo «Código», con «Confirmar» y «Reenviar código» (con su espera de 60 s). Al acertar pasa a **«Verificado»**. Nada más de la app cambia.
- **El correo se ve solo en el perfil propio,** nunca en el ajeno, como hoy.
- **Login:** el enlace «¿Olvidaste tu contraseña?» lleva a `/olvide` (correo y «Enviar código»). Siempre sigue a `/restablecer` con «Si existe una cuenta con ese correo, te enviamos un código.». Allí se piden el código y la contraseña nueva. Al terminar, vuelve al login con «Contraseña cambiada. Inicia sesión con la nueva.».
- **Restablecer verifica el correo:** recibir el código ya demuestra que es tuyo.
- **Invitados:** no tienen correo y no cambia nada para ellos.
- **Cuentas borradas** (`borrada_…`): no reciben códigos ni pueden restablecer.
- **Correos:** en español, sin imágenes ni enlaces, solo el código, como en la etapa 7.
- **Con el interruptor apagado:** sin enlace «olvidé», sin fila de correo y las rutas nuevas responden 404. Todo queda como hoy.

## 5. Servidor

- **Migración aditiva:** `users.email_verified_at` (nulo para todos), el tipo `EmailCodePurpose` (`verify_email`, `reset_password`) y la tabla `email_codes` de la etapa 7. ⚠ Al subir a `main` se pide permiso a Marco nombrando la migración.
- **Códigos y comprobación:** iguales que en la etapa 7, §4.2 y §4.3.
- **Rutas** bajo `/auth`, solo montadas con el interruptor activo, salvo `options`:

| Ruta | Quién | Respuesta |
|---|---|---|
| `GET /auth/options` | todos | `{ emailCodes: boolean }` |
| `POST /auth/verification/send` | con cuenta (no invitado) | `202`; si ya está verificado, `202` sin enviar |
| `POST /auth/verification/confirm` `{ code }` | con cuenta | `200 { emailVerified: true }`; `400 INVALID_CODE` |
| `POST /auth/password/forgot` `{ email }` | público | `202` siempre, sin delatar si existe |
| `POST /auth/password/reset` `{ email, code, password }` | público | `204`; `400 INVALID_CODE`; revoca los tokens de renovación |

- **El estado viaja con el perfil:** `GET /users/me` añade `emailVerified: boolean`. Así el futuro matchmaking solo tendrá que leerlo.
- **Límites:** los de la etapa 7, §4.7. `verification/send` cuenta como envío, con clave el usuario y la IP.
- **Configuración:** `EMAIL_CODES=on|off`, por defecto `off`, más `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM` y `ALLOW_MEMORY_MAIL`, con las reglas de producción de la etapa 7, §4.9. Se cambia el nombre del interruptor porque ya no verifica para entrar.
- **Errores en `shared`:** `INVALID_CODE` (400) y `EMAIL_SEND_FAILED` (502).

## 6. Cliente

- API: `auth.options`, `auth.sendVerification`, `auth.confirmVerification`, `auth.forgotPassword` y `auth.resetPassword`.
- Pantallas `/olvide` y `/restablecer`, recuperadas de `PasswordRecoveryPages.tsx`; el campo de código, de `CodeField.tsx`.
- El recuadro de verificación en el perfil propio.

## 7. Salida

1. Código con `EMAIL_CODES=off`: la migración se aplica y no cambia nada visible.
2. Marco: cuenta gratuita de Resend, dominio `mail.marcovinir.dev` con sus registros DNS, y clave con permiso solo de envío, que **pega él en Render**. `render.yaml` declara las variables con `sync: false`.
3. Activar en Render: `MAIL_PROVIDER=resend`, `MAIL_FROM=Rivalmon <no-responder@mail.marcovinir.dev>` y `EMAIL_CODES=on`. Prueba real con su correo.
4. Marcha atrás: `EMAIL_CODES=off`.
5. Documentación: `docs/correo.md` paso a paso, `docs/despliegue.md`, la guía técnica y los README.

## 8. Pruebas

- **Servidor (TDD, con `MemoryMailer`):** las de la etapa 7 que siguen valiendo (intentos en paralelo, uso único, vencimiento, propósitos cruzados, respuestas iguales con y sin cuenta, límites, configuración, buzón y `ResendMailer` con un `fetch` falso). Además: un invitado no puede pedir verificación, una cuenta borrada no recibe nada, verificar no cambia el juego, y con el interruptor apagado las rutas dan 404.
- **Cliente:** las dos pantallas, el recuadro del perfil, y con el interruptor apagado todo como hoy.
- **E2E** con el servidor en `EMAIL_CODES=on` y buzón en memoria: verificar desde el perfil y «olvidé mi contraseña» completo. Las E2E existentes no cambian, porque el registro es el de hoy.
- **Mutaciones:** contador de intentos, uso único, revocación de sesiones, igualdad de respuestas, vencimiento y la regla que prohíbe la consola en producción.
- **Revisión final independiente** con foco en seguridad.

## 9. Fuera de alcance

Cambiar el correo, el matchmaking, exigir verificación para algo, avisar por correo de un cambio de contraseña, enlaces mágicos, entrar con Google o GitHub, doble factor y captcha.

## 10. Riesgos

Los de la etapa 7, §8, salvo los de las cuentas pendientes, que ya no existen. Además: las cuentas sin verificar pueden tener un correo mal escrito, y eso es justo lo que la verificación opcional deja ver a su dueño.
