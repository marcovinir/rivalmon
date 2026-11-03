import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { joinRoom, newPlayer, playAsGuest, register } from "../support/app";

/** La subasta en dos navegadores reales, sin trampas: el servidor sortea de verdad, así que se comprueba la estructura. */

test.setTimeout(600_000);

const passButton = (page: Page) => page.getByRole("button", { name: /^Retirarme/ });

async function createAuctionRoom(page: Page): Promise<string> {
  await page.goto("/jugar/subasta");
  await page.getByRole("switch", { name: "Siluetas trampa" }).uncheck({ force: true });
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  await expect(page.getByLabel("Configuración de la sala")).toHaveText("Sin siluetas trampa");
  return ((await code.textContent()) ?? "").trim();
}

/** Quién tiene el turno: espera hasta que uno vea «Retirarme»; `null` si ya llegó la revelación. */
async function pageInTurn(pages: [Page, Page], revealTitle: (page: Page) => ReturnType<Page["getByRole"]>): Promise<Page | null> {
  let found: Page | null = null;
  await expect(async () => {
    if (await revealTitle(pages[0]).isVisible()) return;
    const visible = await Promise.all(pages.map((page) => passButton(page).isVisible()));
    found = visible[0] ? pages[0] : visible[1] ? pages[1] : null;
    expect(found).not.toBeNull();
  }).toPass({ timeout: 20_000 });
  return found;
}

/** A lo ancho de la pantalla no sobra nada. */
async function expectFits(page: Page, where: string): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect.soft(scroll, `${where}: desplazamiento horizontal`).toBeLessThanOrEqual(client);
}

test("una partida completa: puja, revelación, alineación, combate, resumen y revancha, con recargas", async ({ browser }) => {
  const ash = await newPlayer(browser, "a".repeat(24));
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);
  await ash.page.setViewportSize({ width: 360, height: 760 });
  const code = await createAuctionRoom(ash.page);
  await misty.page.goto("/jugar/subasta");
  await joinRoom(misty.page, code);
  const pages: [Page, Page] = [ash.page, misty.page];

  for (const page of pages) await expect(page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });

  // A 360 px, con un nombre largo, nada se sale de la pantalla.
  const { scroll, client } = await ash.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  for (const name of [ash.name, misty.name]) {
    const box = await ash.page.getByRole("group", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360.5);
  }

  // Recargar a mitad de un lote vuelve a ese lote.
  await misty.page.reload();
  await expect(misty.page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Quien ya tiene 6 no puja más, y los lotes que quedan van solos al otro. Se juega hasta la revelación.
  const revealTitle = (page: Page) => page.getByRole("heading", { name: "¿Qué compró cada uno?" });
  let moneyWentDown = false;
  for (let turn = 1; turn <= 80 && !(await revealTitle(ash.page).isVisible()); turn++) {
    const money = await misty.page.getByRole("group", { name: misty.name }).textContent({ timeout: 1000 }).catch(() => null);
    const moneyAsh = await misty.page.getByRole("group", { name: ash.name }).textContent({ timeout: 1000 }).catch(() => null);
    if (money !== null && moneyAsh !== null && !(money.includes("2.000.000") && moneyAsh.includes("2.000.000"))) moneyWentDown = true;
    const inTurn = await pageInTurn(pages, revealTitle);
    if (!inTurn) break;
    // A 360 × 760 los botones se alcanzan sin desplazar la página.
    if (inTurn === ash.page) {
      const box = await passButton(ash.page).boundingBox();
      if (box) expect.soft(box.y + box.height + (await ash.page.evaluate(() => window.scrollY)), "Retirarme sin desplazar").toBeLessThanOrEqual(760);
    }
    const bid = inTurn.getByRole("button", { name: /^(\+|Abrir)/ }).first();
    // Se alterna entre pujar y retirarse; hacer clic puede llegar tarde, y no pasa nada.
    if (turn % 3 === 0 && (await bid.isEnabled())) await bid.click({ timeout: 2000 }).catch(() => undefined);
    else await passButton(inTurn).click({ timeout: 2000 }).catch(() => undefined);
    await inTurn.waitForTimeout(100);
  }

  for (const page of pages) await expect(page.getByRole("heading", { name: "¿Qué compró cada uno?" })).toBeVisible({ timeout: 30_000 });
  expect(moneyWentDown, "el dinero baja al comprar").toBe(true);
  await ash.page.getByRole("button", { name: "Listo" }).click();
  await expect(ash.page.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  await misty.page.getByRole("button", { name: "Listo" }).click();

  // Alineación: uno cambia el orden, y el titular es el que eligió.
  for (const page of pages) await expect(page.getByRole("heading", { name: "Elige tu alineación" })).toBeVisible({ timeout: 15_000 });
  const firstUp = ash.page.getByRole("button", { name: /^Subir/ }).nth(1);
  const newTitular = ((await firstUp.getAttribute("aria-label")) ?? "").replace("Subir ", "");
  await firstUp.click();
  for (const page of pages) await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(ash.page.getByRole("meter", { name: `PS de ${newTitular}` })).toBeVisible({ timeout: 15_000 });
  await expectFits(ash.page, "combate");

  // Recargar en el combate vuelve al combate, con la barra.
  await misty.page.reload();
  await expect(misty.page.getByRole("meter").first()).toBeVisible({ timeout: 30_000 });

  // No hay reloj, y a 360 × 760 los movimientos y el equipo se alcanzan sin desplazar la página.
  await expect(ash.page.getByRole("button", { name: /^Cambiar a/ }).first()).toBeVisible({ timeout: 15_000 });
  await expect(ash.page.getByRole("timer")).toHaveCount(0);
  for (const control of [ash.page.locator(".battle-move").last(), ash.page.getByRole("button", { name: /^Cambiar a/ }).last()]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height + (await ash.page.evaluate(() => window.scrollY))).toBeLessThanOrEqual(760);
  }
  const arena = await ash.page.locator("[data-arena]").boundingBox();
  expect(arena!.y, "el escenario se ve entero al empezar").toBeGreaterThanOrEqual(0);
  for (const sprite of await ash.page.locator("[data-arena] .battle-sprite").all()) {
    const box = await sprite.boundingBox();
    if (box) expect.soft(box.y, "el sprite cabe en el escenario").toBeGreaterThanOrEqual(arena!.y - 0.5);
  }

  // A 360 px el rótulo del turno no pisa el recuadro del rival.
  const hud = await ash.page.locator("[data-arena] .battle-hud").first().boundingBox();
  const pill = await ash.page.getByText(/^Asalto \d+ · Turno/).boundingBox();
  expect(hud!.x + hud!.width).toBeLessThanOrEqual(pill!.x);
  // Los movimientos dicen sus PP, y la habilidad sale al poner el cursor.
  await expect(ash.page.locator(".battle-move").first()).toContainText(/PP \d+\/\d+/);
  await ash.page.getByRole("img", { name: newTitular }).hover({ force: true });
  await expect(ash.page.getByRole("tooltip")).toBeVisible();
  await ash.page.mouse.move(0, 0);

  // Cambiar gasta el turno: entra el elegido y el rival lo ve al resolverse.
  const switchButton = ash.page.getByRole("button", { name: /^Cambiar a/ }).first();
  const entering = /^Cambiar a (.+), \d+ % de PS$/.exec((await switchButton.getAttribute("aria-label")) ?? "")![1]!;
  await switchButton.click();
  await expect(switchButton).toHaveAttribute("aria-pressed", "true");
  await misty.page.locator(".battle-move:enabled").first().click();
  for (const page of pages) await expect(page.getByRole("meter", { name: `PS de ${entering}` })).toBeVisible({ timeout: 15_000 });

  // Se pelea hasta el final, eligiendo movimiento y titular. Recargar en la primera pausa la conserva.
  const verdict = (page: Page) => page.getByRole("heading", { name: /^(Ganaste|Perdiste)$/ });
  let reloadedInPause = false;
  for (let tick = 0; tick < 1500 && !(await verdict(ash.page).isVisible()); tick++) {
    for (const page of pages) {
      if (!reloadedInPause && (await page.getByRole("heading", { name: "Pausa entre asaltos" }).isVisible())) {
        reloadedInPause = true;
        await expectFits(page, "pausa");
        await page.reload();
        await expect(page.getByRole("heading", { name: "Pausa entre asaltos" })).toBeVisible({ timeout: 30_000 });
      }
      const move = page.locator(".battle-move:enabled").first();
      if (await move.isVisible()) await move.click({ timeout: 500 }).catch(() => undefined);
      const confirm = page.getByRole("button", { name: "Confirmar" });
      if (await confirm.isVisible()) {
        if (await confirm.isDisabled()) await page.getByRole("button", { name: /^Sacar a/ }).first().click({ timeout: 500 }).catch(() => undefined);
        await confirm.click({ timeout: 500 }).catch(() => undefined);
      }
    }
    await ash.page.waitForTimeout(150);
  }
  for (const page of pages) await expect(verdict(page)).toBeVisible({ timeout: 60_000 });
  expect(reloadedInPause, "hubo una pausa").toBe(true);
  await expect(ash.page.getByRole("region", { name: "Resumen del combate" })).toBeVisible();
  await expectFits(ash.page, "resumen");

  // Revancha: empieza de cero.
  await ash.page.getByRole("button", { name: "Revancha" }).click();
  await misty.page.getByRole("button", { name: "Aceptar" }).click();
  for (const page of pages) await expect(page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 45_000 });
  for (const name of [ash.name, misty.name]) await expect(misty.page.getByRole("group", { name })).toContainText("2.000.000");
});

test("con «reducir movimiento», el destello del golpe sí dura", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await ash.page.emulateMedia({ reducedMotion: "reduce" });
  await ash.page.goto("/");
  const duration = await ash.page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "battle-flash";
    document.body.append(probe);
    return getComputedStyle(probe).animationDuration;
  });
  expect(duration).toBe("0.3s");
});

test("el menú ofrece la subasta", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  await register(ash);
  await ash.page.goto("/");
  await ash.page.getByRole("article").filter({ hasText: "Subasta Pokémon" }).getByRole("link", { name: /Jugar/ }).click();
  await expect(ash.page.getByRole("switch", { name: "Siluetas trampa" })).toBeChecked();
});

test("la revelación conserva el contraste en los cuatro temas, en móvil y escritorio", async ({ browser }, testInfo) => {
  const ash = await playAsGuest(browser, "contraste");
  const misty = await playAsGuest(browser, "rival");
  try {
    const code = await createAuctionRoom(ash.page);
    await joinRoom(misty.page, code);
    const pages: [Page, Page] = [ash.page, misty.page];
    const revealTitle = (page: Page) => page.getByRole("heading", { name: "¿Qué compró cada uno?" });
    for (let turn = 0; turn < 80 && !(await revealTitle(ash.page).isVisible()); turn++) {
      const inTurn = await pageInTurn(pages, revealTitle);
      if (!inTurn) break;
      // La transición de lote puede retirar el botón entre comprobarlo y pulsarlo.
      await passButton(inTurn).click({ timeout: 2000 }).catch(() => undefined);
      await inTurn.waitForTimeout(100);
    }
    for (const page of pages) await expect(revealTitle(page)).toBeVisible();

    // Dos vistas simultáneas de la partida real: la auditoría no depende de esperar a que aparezcan los 12.
    const audit = readFileSync(new URL("../../client/scripts/contrast-audit.js", import.meta.url), "utf8");
    for (const [index, page] of pages.entries()) {
      const width = index === 0 ? 375 : 1280;
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(0, 0);
      await expect.poll(() => page.locator("[data-reveal-entry] img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      // Se mide el contraste en reposo, sin tomar una tarjeta a mitad de su animación de entrada.
      await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
      await page.addScriptTag({ content: audit });
      const report = await page.evaluate(() => (window as unknown as { __contrastAuditAll(): Promise<Record<string, string[]>> }).__contrastAuditAll());
      expect.soft(report, `${width} px: contraste del texto de la revelación`).toEqual({
        "clasico/claro": [], "clasico/oscuro": [], "pokedex/claro": [], "pokedex/oscuro": [],
      });

      for (const theme of ["clasico", "pokedex"]) {
        for (const mode of ["claro", "oscuro"]) {
          await page.evaluate(({ theme, mode }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.mode = mode;
          }, { theme, mode });
          // La corrección oscura debe conservarse al pasar el ratón; los modos claros no se modifican (#65).
          if (mode === "oscuro") {
            await page.getByRole("button", { name: "Listo" }).hover();
            await page.waitForTimeout(150);
            const hovered = await page.evaluate(() => (window as unknown as { __contrastAudit(): string[] }).__contrastAudit());
            expect.soft(hovered, `${width} px, ${theme}/${mode}, sobre «Listo»`).toEqual([]);
            await page.mouse.move(0, 0);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}-${mode}.png`), fullPage: true });
        }
      }
    }
  } finally {
    await ash.context.close();
    await misty.context.close();
  }
});
