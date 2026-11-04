# Correo: olvidé mi contraseña y verificar el correo (Resend)

Esta guía activa en el sitio en vivo dos funciones con un **código de 6 dígitos por correo**:

- **¿Olvidaste tu contraseña?:** el enlace aparece en la pantalla de iniciar sesión.
- **Verificar el correo:** se hace desde tu perfil. Es **opcional y no bloquea nada**; más adelante lo pedirá el matchmaking.

Los correos los envía **Resend**, un servicio con capa gratuita. Render, en su capa gratuita, bloquea el correo directo por SMTP, así que hace falta un servicio que funcione por internet.

Con lo que viene de fábrica (`EMAIL_CODES` apagada) el juego funciona exactamente como antes.

## Qué cambia cuando lo activas

- **Olvidé mi contraseña:** escribes tu correo, llega un código y eliges una contraseña nueva. Al cambiarla se cierran las sesiones abiertas en otros dispositivos, y el correo queda verificado.
- **Verificar el correo:** en tu perfil, la fila «Correo» dice si está verificado. Si no lo está, «Verificar» envía un código y lo escribes ahí mismo.
- **Los códigos** duran 10 minutos, valen una sola vez y se bloquean tras 5 intentos equivocados.
- **Límites:** un código nuevo por correo cada 60 segundos, como máximo 5 por hora por correo y 10 por hora por IP. La capa gratuita de Resend tiene un tope diario y otro mensual; míralos en [resend.com/pricing](https://resend.com/pricing).
- **Sin pistas:** nadie puede saber desde fuera si un correo tiene cuenta, porque la pantalla contesta lo mismo en los dos casos.
- **El token de acceso ya emitido** sigue valiendo hasta que caduca, como mucho una hora, después de cambiar la contraseña: las sesiones se cierran del todo al no poder renovarse.
- **Nada más cambia:** registrarse, iniciar sesión y jugar son iguales, y las cuentas que ya existen siguen funcionando sin verificar.

## Antes de empezar

Necesitas:

1. **El dominio** `marcovinir.dev` y acceso a su panel de DNS. Los correos saldrán de un subdominio, `mail.marcovinir.dev`, para que su reputación no se mezcle con la del dominio principal.
2. **Una cuenta gratuita en Resend** ([resend.com](https://resend.com)).
3. **Acceso al panel de Render**, donde está el servicio `pokemon-minigames`.
4. **`TRUST_PROXY` comprobado** (sección 5 de la [guía de despliegue](despliegue.md#5-verificar-trust_proxy-una-sola-vez-tras-el-primer-despliegue)): los límites por IP dependen de que el servidor lea bien la IP de cada visitante. Ya se hizo con el valor 3; solo hay que repetirlo si cambia algo en Render.

Calcula media hora de trabajo más la espera de los registros DNS, que va de unos minutos a unas horas.

> **La clave de API es un secreto: solo se pega en el panel de Render.** Nunca en el chat, en un archivo del repositorio, en una captura ni en un correo. Si por error se muestra en algún sitio, bórrala en Resend y crea otra (paso 3).

## 1. Crear la cuenta de Resend

1. Entra en [resend.com](https://resend.com), pulsa **Sign up** (con GitHub o con un correo) y confirma tu correo.
2. Déjala en el plan **Free**, que no pide tarjeta.

## 2. Añadir el dominio en Resend y verificarlo

1. En Resend abre **Domains** → **Add Domain** y escribe `mail.marcovinir.dev`.
2. Elige la región más cercana que ofrezca, por ejemplo N. Virginia o São Paulo.
3. Resend muestra los **registros DNS** que hay que crear (así salieron para `mail.marcovinir.dev` el 2026-11-03):
   - **DKIM**, la firma de los mensajes: un `TXT` con nombre `resend._domainkey.mail` y un valor largo que empieza por `p=`. Cópialo con el botón de copiar de Resend: en pantalla sale recortado.
   - **SPF**, la autorización para enviar: dos `CNAME`, `rsend.mail` → `rsend.forge.rmta.net` y `send.mail` → `send.forge.rmta.net`.

   Añade **exactamente los que Resend te muestra en su pestaña *Records***: puede cambiar el formato con el tiempo. Si tu DNS es Cloudflare, los `CNAME` van en **DNS only** (nube gris).
4. En el panel de DNS de tu dominio, crea cada registro con el mismo tipo, nombre y valor. Si tu panel ya añade el dominio al final del nombre, escribe solo la parte de la izquierda (por ejemplo `resend._domainkey.mail`).
5. **Recomendado, DMARC:** crea el registro `TXT` que propone Resend, con nombre `_dmarc` y valor `v=DMARC1; p=none;`: vigila sin rechazar nada.
6. De vuelta en Resend pulsa **Verify DNS Records**. El estado pasa de *Pending* a **Verified**; puede tardar de minutos a unas horas. No sigas hasta ver *Verified*.

## 3. Crear la clave de API

1. En Resend abre **API Keys** → **Create API Key**.
2. Rellena:
   - **Nombre:** `rivalmon`.
   - **Permiso (*Permission*):** **Sending access**. Solo permite enviar, así que si la clave se filtra nadie puede leer ni borrar nada.
   - **Dominio (*Domain*):** `mail.marcovinir.dev`.
3. Resend muestra la clave **una sola vez** (empieza por `re_`). Cópiala y pasa al paso 4 sin cerrar la pestaña. Si la pierdes, bórrala y crea otra.

## 4. Poner las variables en Render

En [dashboard.render.com](https://dashboard.render.com), abre el servicio `pokemon-minigames` → **Environment** → **+ Add Environment Variable**. Añade estas cuatro variables, porque Render no las crea sola en un servicio que ya existe, y guarda **una sola vez**, con todas a la vez:

| Variable | Valor | Para qué |
|---|---|---|
| `RESEND_API_KEY` | la clave `re_…` que copiaste en el paso 3 | Permite enviar |
| `MAIL_FROM` | `Rivalmon <no-responder@mail.marcovinir.dev>` | El remitente: tiene que ser del dominio que verificaste |
| `MAIL_PROVIDER` | `resend` | Envía con Resend |
| `EMAIL_CODES` | `on` | Enciende las dos funciones |

Al guardar, elige **Save and deploy**: vuelve a desplegar la misma versión con las variables nuevas. Con *Save only* no se despliega nada.

En **Logs** debe aparecer `Servidor escuchando`. Si en cambio dice `Variables de entorno inválidas`, el mensaje nombra la variable que falla, por ejemplo `RESEND_API_KEY: es obligatoria con MAIL_PROVIDER=resend`. Corrígela y guarda; mientras tanto el servicio anterior sigue sirviendo.

## 5. Probar de verdad

1. **Verificar:** inicia sesión con tu cuenta, abre tu perfil y pulsa **Verificar** en la fila «Correo». Busca el mensaje «Tu código de Rivalmon». Si no está en la bandeja, mira la **carpeta de spam**: en un dominio nuevo es normal al principio, y marcarlo como «no es spam» ayuda. Escribe el código y la fila debe pasar a «Verificado».
2. **Recuperar la contraseña:** cierra sesión, pulsa **¿Olvidaste tu contraseña?**, escribe tu correo, recibe el código, elige una contraseña nueva e inicia sesión con ella.

Si algo falla, mira la tabla del final.

## Marcha atrás

Si algo sale mal o quieres parar los correos: en Render → **Environment** pon `EMAIL_CODES` a `off` y guarda con **Save and deploy**. El sitio vuelve a funcionar exactamente como antes: desaparecen «¿Olvidaste tu contraseña?» y la fila del correo del perfil. Las cuentas que verificaron su correo lo conservan para cuando se vuelva a activar. No hace falta borrar las demás variables.

## Si algo no funciona

| Qué ves | Qué mirar |
|---|---|
| «No pudimos enviar el correo. Inténtalo de nuevo en un momento.» | Resend rechazó el envío: la clave está mal copiada o borrada, el dominio aún no está verificado, o `MAIL_FROM` usa un dominio distinto del verificado. En Resend, la sección **Logs** o **Emails** dice el motivo. |
| No llega nada, pero tampoco hay error | La carpeta de spam. Después, en Resend → **Emails**, el estado del mensaje (*Delivered*, *Bounced*…). |
| «Demasiados intentos. Inténtalo de nuevo en…» | Se alcanzó un límite: un código por minuto, 5 por hora, o 5 intentos de código cada 10 minutos. La pantalla dice cuánto esperar. |
| El servicio no arranca: `Variables de entorno inválidas` | El mensaje nombra la variable que falta o está mal escrita. |
| Se acaba la cuota de Resend | La pantalla dice que no pudo enviar el correo. Espera al día siguiente o aplica la marcha atrás. |

## Probar en tu computadora sin Resend

En `server/.env` pon `EMAIL_CODES=on`; en desarrollo el proveedor de partida es `console`. Arranca el servidor con `npm run dev`: cada correo «se envía» a la consola del servidor con la línea `[correo simulado] para …`, y de ahí copias el código.

En producción el servidor **no** admite `console`, porque escribiría los códigos en el registro, y se niega a arrancar.
