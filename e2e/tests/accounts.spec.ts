import { expect, test } from "@playwright/test";
import { codeFor, newPlayer, register, wrongCode } from "../support/app";

/** Los códigos por correo (#64): el servidor de la E2E los tiene encendidos y guarda los correos en un buzón en memoria. */

test("olvidé mi contraseña: llega el código, se elige otra y se entra con ella", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await register(ash);
  // Sin sesión: se borran las cookies y se vuelve a la pantalla de entrar.
  await ash.context.clearCookies();
  await ash.page.goto("/login");
  await ash.page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await ash.page.getByLabel("Email").fill(`  ${ash.email.toUpperCase()} `);
  await ash.page.getByRole("button", { name: "Enviar código" }).click();
  await expect(ash.page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible();
  await ash.page.getByLabel("Código", { exact: true }).fill(await codeFor(ash));
  await ash.page.getByLabel("Nueva contraseña").fill("otra-clave-123");
  await ash.page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await expect(ash.page.getByText("Contraseña cambiada. Inicia sesión con la nueva.")).toBeVisible();
  await ash.page.getByLabel("Email").fill(ash.email);
  await ash.page.getByLabel("Contraseña", { exact: true }).fill("otra-clave-123");
  await ash.page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(ash.page).not.toHaveURL(/\/login/);
});

test("verificar el correo desde el perfil, sin que cambie nada más", async ({ browser }) => {
  const misty = await newPlayer(browser, "misty");
  await register(misty);
  await misty.page.goto("/perfil");
  await expect(misty.page.getByText("Sin verificar")).toBeVisible();
  await misty.page.getByRole("button", { name: "Verificar", exact: true }).click();
  await misty.page.getByLabel("Código", { exact: true }).fill(await codeFor(misty));
  await misty.page.getByRole("button", { name: "Confirmar" }).click();
  await expect(misty.page.getByText("Verificado", { exact: true })).toBeVisible();
  await misty.page.reload();
  await expect(misty.page.getByText("Verificado", { exact: true })).toBeVisible();
});

test("tras 5 códigos equivocados ni el bueno sirve", async ({ browser }) => {
  const brock = await newPlayer(browser, "brock");
  await register(brock);
  await brock.page.goto("/perfil");
  await brock.page.getByRole("button", { name: "Verificar", exact: true }).click();
  const real = await codeFor(brock);
  for (let attempt = 0; attempt < 5; attempt++) {
    await brock.page.getByLabel("Código", { exact: true }).fill(wrongCode(real));
    await brock.page.getByRole("button", { name: "Confirmar" }).click();
    await expect(brock.page.getByText(/Código incorrecto|Demasiados intentos/)).toBeVisible();
  }
  await brock.page.getByLabel("Código", { exact: true }).fill(real);
  await brock.page.getByRole("button", { name: "Confirmar" }).click();
  await expect(brock.page.getByText(/Código incorrecto|Demasiados intentos/)).toBeVisible();
  await expect(brock.page.getByText("Sin verificar")).toBeVisible();
});

for (const width of [360, 375]) {
  test(`a ${width} px caben las pantallas del código y la fila del correo, con un nombre de 30 letras`, async ({ browser }) => {
    const player = await newPlayer(browser, "x".repeat(24));
    await player.page.setViewportSize({ width, height: 760 });
    await register(player);
    await player.page.goto("/perfil");
    await player.page.getByRole("button", { name: "Verificar", exact: true }).click();
    await expect(player.page.getByLabel("Código", { exact: true })).toBeVisible();
    for (const path of ["/perfil", "/olvide"]) {
      if (path === "/olvide") {
        await player.context.clearCookies();
        await player.page.goto(path);
      }
      const { scroll, client } = await player.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(scroll, path).toBeLessThanOrEqual(client);
      for (const box of await player.page.locator("main button, main input").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
        expect(box.x, path).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width, path).toBeLessThanOrEqual(width + 0.5);
      }
    }
  });
}
