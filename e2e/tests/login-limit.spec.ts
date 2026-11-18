import { expect, test } from "@playwright/test";
import { PASSWORD, logIn, newPlayer, register } from "../support/app";

test("tras varias contraseñas erróneas el servidor responde 429 y el mensaje dice cuánto esperar", async ({ browser }) => {
  const owner = await newPlayer(browser, "limite");
  // Otro navegador y la misma IP: así se comprueba el límite por IP y correo, no una cookie.
  const attacker = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": owner.ip } });
  try {
    await register(owner);
    const page = await attacker.newPage();

    // La espera se cuenta desde el primer fallo: en un equipo lento los intentos tardan y quedan menos de 15 min (#68).
    const started = Date.now();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await logIn(page, owner.email, "mala-clave-1");
      await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos.");
    }

    // El sexto intento, aunque lleve la contraseña correcta, ya está bloqueado.
    await logIn(page, owner.email, PASSWORD);
    const alert = page.getByRole("alert");
    await expect(alert).toHaveText(/^Demasiados intentos\. Inténtalo de nuevo en \d+ min\.$/);
    const minutes = Number(/en (\d+) min/.exec((await alert.textContent()) ?? "")![1]);
    const elapsed = Math.floor((Date.now() - started) / 60_000);
    expect(minutes, "lo que queda de los 15 min desde el primer fallo").toBeLessThanOrEqual(15);
    expect(minutes).toBeGreaterThanOrEqual(15 - elapsed - 1);
    await expect(page).toHaveURL(/\/login$/);

    // No es un bloqueo de la cuenta: desde otra IP la contraseña correcta funciona.
    const other = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "10.250.250.250" } });
    try {
      const otherPage = await other.newPage();
      await logIn(otherPage, owner.email, PASSWORD);
      await expect(otherPage.getByRole("heading", { name: "¿A qué jugamos?" })).toBeVisible();
    } finally {
      await other.close();
    }
  } finally {
    await owner.context.close();
    await attacker.close();
  }
});
