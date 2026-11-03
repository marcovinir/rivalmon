import { useEffect, useState } from "react";
import type { Endpoints } from "../api/endpoints";
import { useServices } from "../services";

/** Una consulta por conjunto de servicios: las pantallas de acceso no la repiten al cambiar de una a otra. */
const asked = new WeakMap<Endpoints, Promise<boolean>>();

/**
 * ¿Tiene el servidor encendidos los códigos por correo (`EMAIL_CODES`)? Mientras no se sabe (o si la consulta falla) es
 * `false`: la aplicación se comporta como antes y no ofrece «¿Olvidaste tu contraseña?» ni la fila del correo del perfil.
 * Una consulta fallida no se recuerda.
 */
export function useEmailCodes(): boolean {
  const { endpoints } = useServices();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    let answer = asked.get(endpoints);
    if (!answer) {
      answer = endpoints.auth.options().then(
        (options) => options.emailCodes,
        () => {
          asked.delete(endpoints);
          return false;
        },
      );
      asked.set(endpoints, answer);
    }
    void answer.then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, [endpoints]);

  return enabled;
}
