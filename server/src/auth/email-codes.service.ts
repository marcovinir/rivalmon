import { isDeletedUsername } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../http/errors.js";
import { type Mail, type Mailer, MailerError } from "../mail/mailer.js";
import { passwordResetMail, verificationMail } from "../mail/templates.js";
import type { EmailCodeStore } from "./email-codes.js";
import type { PasswordHasher } from "./password.js";

export interface EmailCodesServiceDeps {
  prisma: PrismaClient;
  codes: EmailCodeStore;
  mailer: Mailer;
  hasher: PasswordHasher;
  now?: () => Date;
  /** Dónde se anotan los fallos de envío (por defecto, la consola de errores). */
  log?: (message: string) => void;
}

const sendFailed = () => new AppError(502, "EMAIL_SEND_FAILED", "No pudimos enviar el correo. Inténtalo de nuevo en un momento.");

/**
 * Los códigos por correo (#64): verificar el correo desde la cuenta, que es opcional y no bloquea nada, y recuperar la
 * contraseña. Recupera lo de la etapa 7 sin las cuentas pendientes ni la verificación obligatoria.
 */
export class EmailCodesService {
  private readonly prisma: PrismaClient;
  private readonly codes: EmailCodeStore;
  private readonly mailer: Mailer;
  private readonly hasher: PasswordHasher;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(deps: EmailCodesServiceDeps) {
    this.prisma = deps.prisma;
    this.codes = deps.codes;
    this.mailer = deps.mailer;
    this.hasher = deps.hasher;
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? ((message) => console.error(message));
  }

  /** El correo de una cuenta con sesión; sirve de clave para los límites. */
  async emailOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });
    if (!user || isDeletedUsername(user.username)) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    return user.email;
  }

  /**
   * Envía el código para verificar el correo. Ya verificado, no envía y lo dice (la pantalla puede ir atrasada). Quien lo
   * pide espera, así que un fallo se le dice.
   */
  async sendVerification(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, username: true, emailVerifiedAt: true } });
    // Pudo borrarse justo después de comprobarlo: su correo ya es `@invalid` y no se le envía nada.
    if (isDeletedUsername(user.username)) throw new AppError(401, "UNAUTHORIZED", "El usuario ya no existe");
    if (user.emailVerifiedAt !== null) return { alreadyVerified: true };
    const code = await this.codes.issue(this.prisma, userId, "verify_email");
    try {
      await this.mailer.send(verificationMail(user.email, code));
    } catch (error) {
      this.logMailFailure(error);
      throw sendFailed();
    }
    return { alreadyVerified: false };
  }

  /** Comprueba el código de la propia cuenta y marca el correo como verificado. Cualquier fallo del código es INVALID_CODE. */
  async confirmVerification(userId: string, code: string): Promise<void> {
    const claim = await this.codes.claim(userId, "verify_email", code);
    const now = this.now();
    await this.prisma.$transaction(async (tx) => {
      await claim.consume(tx);
      // La primera verificación manda: no se cambia la fecha de una cuenta que ya estaba verificada.
      await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    });
  }

  /**
   * Envía el código para cambiar la contraseña si hay una cuenta con ese correo. Nadie espera su respuesta (la ruta contesta
   * antes), así que un fallo del proveedor solo se anota. Una cuenta borrada tiene un correo `@invalid` y nunca coincide.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, username: true } });
    if (!user || isDeletedUsername(user.username)) return;
    const code = await this.codes.issue(this.prisma, user.id, "reset_password");
    await this.sendQuietly(passwordResetMail(email, code));
  }

  /**
   * Cambia la contraseña con el código. Revoca todas las sesiones abiertas de la cuenta y no abre ninguna. Recibir el código
   * ya demuestra el correo, así que también lo da por verificado. Cualquier fallo del código es INVALID_CODE.
   */
  async resetPassword(input: { email: string; code: string; password: string }): Promise<void> {
    const { userId, claim } = await this.codes.claimByEmail(input.email, "reset_password", input.code);
    // El hash, que tarda, va después de comprobar el código: con uno inválido no se gasta ese trabajo.
    const passwordHash = await this.hasher.hash(input.password);
    const now = this.now();
    await this.prisma.$transaction(async (tx) => {
      await claim.consume(tx);
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      // Un código de verificar que siguiera pendiente ya no hace falta.
      await tx.emailCode.deleteMany({ where: { userId, purpose: "verify_email" } });
    });
  }

  private async sendQuietly(mail: Mail): Promise<void> {
    try {
      await this.mailer.send(mail);
    } catch (error) {
      this.logMailFailure(error);
    }
  }

  /** Anota un fallo de envío sin la dirección ni el código: solo lo que dice el proveedor. */
  private logMailFailure(error: unknown): void {
    const reason = error instanceof MailerError ? error.message : error instanceof Error ? error.name : "error desconocido";
    this.log(`[correo] No se pudo enviar un código: ${reason}`);
  }
}
