import { CODE_LENGTH, CODE_TTL_MINUTES } from "../auth/code-policy.js";
import type { Mail } from "./mailer.js";

/** Escapa lo que cambia el significado del HTML. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Nada ajeno entra en un correo: el código son exactamente seis dígitos o no se escribe. */
function assertCode(code: string): void {
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) throw new RangeError("El código debe tener seis dígitos");
}

const SIGNATURE = "— Rivalmon · Minijuegos Pokémon 1 vs 1";
const FOOTER = "Proyecto de fans sin fines de lucro. No respondas a este correo.";
const EXPIRES = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje.`;

/** El texto plano: título, el código con sus frases y la firma. */
function plain(title: string, line: string, outro: string): string {
  return `${title}\n\n${line}\n${outro}\n\n${SIGNATURE}\n${FOOTER}`;
}

/**
 * HTML con estilos en línea y tablas, que es lo que respetan los programas de correo. Sin imágenes ni enlaces: nada que
 * rastrear, y llega mejor a la bandeja de entrada. La cabecera es el logo hecho con texto: rojo y azul con la franja amarilla.
 */
function page(title: string, intro: string, code: string, outro: string): string {
  const cell = "font-family:Arial,Helvetica,sans-serif";
  // Una letra gruesa que traen casi todos los sistemas: las fuentes web no llegan a la mayoría de los programas de correo.
  const logo = "font-family:'Arial Black','Arial Bold',Gadget,Arial,sans-serif;font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 0 #1b1147";
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px 12px;background:#eef1f8;${cell};color:#1b1147">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d9dcea">
<tr><td style="padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="50%" style="background:#e5352b;padding:16px 8px 16px 0;${logo};text-align:right">Rival</td>
<td width="10" style="background:#ffcb05;font-size:0;line-height:0">&nbsp;</td>
<td width="50%" style="background:#2563d9;padding:16px 0 16px 8px;${logo};text-align:left">mon</td>
</tr></table>
<p style="margin:0;padding:6px 0;background:#1b1147;color:#ffffff;text-align:center;${cell};font-size:12px;letter-spacing:2px">Rivalmon</p>
</td></tr>
<tr><td style="padding:26px 26px 8px;${cell}">
<h1 style="margin:0 0 12px;font-family:'Arial Black','Arial Bold',Gadget,Arial,sans-serif;font-size:22px;font-weight:900;color:#1b1147">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p>
<p style="margin:0 0 18px;padding:14px 0;text-align:center;background:#fff7d6;border:2px dashed #ffcb05;border-radius:10px;font-size:34px;font-weight:bold;letter-spacing:10px;font-family:'Courier New',Courier,monospace;color:#1b1147">${escapeHtml(code)}</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4a4566">${escapeHtml(outro)}</p>
</td></tr>
<tr><td style="padding:14px 26px 20px;border-top:1px solid #e6e8f2;${cell};font-size:12px;line-height:1.5;color:#6b6788">
${escapeHtml(SIGNATURE)}<br>${escapeHtml(FOOTER)}
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/** El código para verificar el correo de una cuenta. No lleva el nombre de usuario ni ningún otro dato. */
export function verificationMail(to: string, code: string): Mail {
  assertCode(code);
  return {
    to,
    subject: "Tu código de Rivalmon",
    text: plain("Verifica tu correo", `Tu código de verificación es ${code}.`, EXPIRES),
    html: page("Verifica tu correo", "Escribe este código en tu perfil de Rivalmon para verificar tu correo:", code, EXPIRES),
  };
}

/** El código para cambiar la contraseña. Aclara que, si no se pidió, la contraseña no cambia. */
export function passwordResetMail(to: string, code: string): Mail {
  assertCode(code);
  const outro = `Caduca en ${CODE_TTL_MINUTES} minutos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.`;
  return {
    to,
    subject: "Código para cambiar tu contraseña de Rivalmon",
    text: plain("Cambia tu contraseña", `Tu código para cambiar la contraseña es ${code}.`, outro),
    html: page("Cambia tu contraseña", "Escribe este código en Rivalmon para elegir una contraseña nueva:", code, outro),
  };
}
