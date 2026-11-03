import { Link, useLocation, useNavigate } from "react-router";
import { Notice } from "../components/Notice";
import { useServices } from "../services";
import { AuthForm } from "./AuthForm";
import { useEmailCodes } from "../session/auth-options";
import { AuthLayout } from "./AuthLayout";
import { GuestEntry } from "./GuestEntry";
import { validateLogin, validateRegistration } from "./auth-validation";

/** A dónde volver tras iniciar sesión: la pantalla que se intentó abrir, o el lobby. */
function useReturnPath(): string {
  const state = useLocation().state as { from?: { pathname?: string } } | null;
  return state?.from?.pathname ?? "/";
}

export function LoginPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const returnTo = useReturnPath();
  // Un aviso que trae la navegación (p. ej. «Tu cuenta se borró.» al borrar la cuenta).
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  // Con el interruptor apagado no hay correos que enviar: no se ofrece recuperar la contraseña.
  const emailCodes = useEmailCodes();

  return (
    <AuthLayout>
      <div className="flex min-w-0 flex-col gap-5">
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        <AuthForm
          title="Iniciar sesión"
          submitLabel="Entrar"
          validate={validateLogin}
          extra={
            emailCodes ? (
              <Link to="/olvide" className="text-sm font-semibold text-accent underline">
                ¿Olvidaste tu contraseña?
              </Link>
            ) : undefined
          }
          onSubmit={async ({ email, password }) => {
            await session.getState().login({ email, password });
            navigate(returnTo, { replace: true });
          }}
          footer={
            <>
              ¿No tienes cuenta?{" "}
              <Link to="/registro" className="font-semibold text-accent underline">
                Crea una
              </Link>
            </>
          }
        />
        <GuestEntry returnTo={returnTo} />
      </div>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { session } = useServices();
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <AuthForm
        title="Crear cuenta"
        submitLabel="Crear cuenta"
        withUsername
        validate={validateRegistration}
        onSubmit={async ({ email, username, password }) => {
          await session.getState().register({ email, username, password });
          navigate("/", { replace: true });
        }}
        footer={
          <>
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="font-semibold text-accent underline">
              Inicia sesión
            </Link>
          </>
        }
      />
    </AuthLayout>
  );
}
