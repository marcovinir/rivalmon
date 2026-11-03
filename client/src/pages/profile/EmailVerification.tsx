import { type FormEvent, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CodeField } from "../../components/CodeField";
import { Notice } from "../../components/Notice";
import { errorMessage } from "../../i18n/es";
import { useServices } from "../../services";
import { useCooldown } from "../use-cooldown";

/** El servidor deja un código nuevo por correo cada 60 s. */
const RESEND_WAIT_SECONDS = 60;

const describe = (error: unknown): string => (error instanceof ApiError ? error.message : errorMessage(undefined));

/**
 * En el perfil propio: el correo y si está verificado (#64). Verificar es opcional y no bloquea nada; el código llega por
 * correo y se escribe aquí mismo.
 */
export function EmailVerification({ email, verified }: { email: string; verified: boolean }) {
  const { endpoints, session } = useServices();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cooldown = useCooldown();

  /** El correo quedó verificado: se dice, y el foco (que estaba en un botón que desaparece) va al título. */
  function verifiedNow(): void {
    session.getState().markEmailVerified();
    setOpen(false);
    setNotice("Correo verificado.");
    titleRef.current?.focus();
  }

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { alreadyVerified } = await endpoints.auth.sendVerification();
      // Se verificó en otra pestaña o dispositivo: no llegará ningún código, la pantalla se pone al día.
      if (alreadyVerified) return verifiedNow();
      setNotice(open ? "Te enviamos un código nuevo." : null);
      setOpen(true);
      cooldown.start(RESEND_WAIT_SECONDS);
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (code.length !== 6) {
      setError("El código son 6 dígitos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await endpoints.auth.confirmVerification(code);
      verifiedNow();
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="email-title" className="flex flex-col gap-3 p-5">
      <h2 id="email-title" ref={titleRef} tabIndex={-1} className="font-display text-xl font-semibold outline-none">
        Correo
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
        <Badge tone={verified ? "success" : "neutral"}>{verified ? "Verificado" : "Sin verificar"}</Badge>
      </div>
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {verified ? null : open ? (
        <form onSubmit={confirm} noValidate className="flex flex-col gap-3">
          <p className="text-sm text-muted">Te enviamos un código de 6 dígitos. Escríbelo aquí.</p>
          <CodeField value={code} onChange={setCode} autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={busy}>
              Confirmar
            </Button>
            <Button onClick={send} disabled={busy || cooldown.remaining > 0}>
              {cooldown.remaining > 0 ? `Reenviar código (espera ${cooldown.remaining} s)` : "Reenviar código"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Verificarlo es opcional: asegura que puedas recuperar tu contraseña.</p>
          <div>
            <Button onClick={send} loading={busy}>
              Verificar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
