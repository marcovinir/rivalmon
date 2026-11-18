import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { joinRoom, newPlayer, playAsGuest, register } from "../support/app";

/** #40: una subasta entre dos cuentas queda en los dos perfiles; con un invitado, no. */
test.setTimeout(240_000);

async function createAuctionRoom(page: Page): Promise<string> {
  await page.goto("/jugar/subasta");
  await page.getByRole("button", { name: "Crear sala" }).click();
  const code = page.getByLabel("Código de la sala");
  await expect(code).toBeVisible();
  return ((await code.textContent()) ?? "").trim();
}

async function leave(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Abandonar partida" }).click();
  await page.getByRole("button", { name: "Sí, abandonar" }).click();
}

/** El valor de una ficha del bloque de la subasta. */
const tile = (page: Page, label: string) => page.getByRole("region", { name: "Subasta Pokémon" }).getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");

test("una subasta entre dos cuentas queda en los dos perfiles, y con un invitado no", async ({ browser }) => {
  const ash = await newPlayer(browser, "ash");
  const misty = await newPlayer(browser, "misty");
  await register(ash);
  await register(misty);

  const code = await createAuctionRoom(ash.page);
  await misty.page.goto("/jugar/subasta");
  await joinRoom(misty.page, code);
  for (const page of [ash.page, misty.page]) await expect(page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });
  await leave(misty.page);
  await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 15_000 });

  // El guardado va por detrás del final: se recarga hasta que aparece.
  await expect(async () => {
    await ash.page.goto("/perfil");
    await expect(tile(ash.page, "Partidas")).toHaveText("1", { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(tile(ash.page, "Ganadas")).toHaveText("1");
  const mine = ash.page.getByRole("list", { name: "Tus últimas subastas" }).getByRole("listitem");
  await expect(mine).toHaveCount(1);
  await expect(mine.first()).toContainText("Ganaste");
  await expect(mine.first()).toContainText("Tu rival abandonó");
  await expect(mine.first().getByRole("link", { name: misty.name })).toBeVisible();

  await misty.page.goto("/perfil");
  await expect(tile(misty.page, "Perdidas")).toHaveText("1");
  await expect(misty.page.getByRole("list", { name: "Tus últimas subastas" }).getByRole("listitem").first()).toContainText("Abandonaste la partida");
  // El perfil ajeno enseña el resumen, pero no sus partidas.
  await misty.page.goto(`/jugador/${ash.name}`);
  await expect(tile(misty.page, "Ganadas")).toHaveText("1");
  await expect(misty.page.getByRole("list", { name: "Tus últimas subastas" })).toHaveCount(0);

  // Con un invitado no queda rastro: ash sigue con una sola partida.
  const gary = await playAsGuest(browser, "gary");
  const second = await createAuctionRoom(ash.page);
  await gary.page.goto("/jugar/subasta");
  await joinRoom(gary.page, second);
  await expect(ash.page.getByText("Lote 1 de 12", { exact: true })).toBeVisible({ timeout: 30_000 });
  await leave(gary.page);
  await expect(ash.page.getByRole("heading", { name: "Ganaste" })).toBeVisible({ timeout: 15_000 });
  await ash.page.goto("/perfil");
  await expect(tile(ash.page, "Partidas")).toHaveText("1");
});

test("el perfil con 10 subastas y un rival de nombre largo cabe y tiene contraste en los 4 temas", async ({ browser }, testInfo) => {
  const ash = await newPlayer(browser, "ash");
  await register(ash);
  const games = Array.from({ length: 10 }, (_, index) => ({
    id: `a${index}`,
    endedAt: new Date(Date.UTC(2026, 10, 14 - index)).toISOString(),
    result: index % 3 ? "won" : "lost",
    reason: index === 2 ? "forfeit" : "completed",
    opponent: { username: "m".repeat(30), avatarId: 25 },
    team: [740, 931, 947, 994, 1006, 1012],
  }));
  // Al cambiar de tema, la auditoría hace que los bloques vuelvan a entrar desde opacidad 0: sin animaciones, mide y
  // fotografía el estado final.
  await ash.page.emulateMedia({ reducedMotion: "reduce" });
  await ash.page.route("**/stats/auction/history", (route) => route.fulfill({ json: { games } }));
  // El resumen también: sin partidas, el perfil ni pide la lista.
  await ash.page.route(/\/stats$/, async (route) => {
    const real = await (await route.fetch()).json();
    await route.fulfill({ json: { ...real, auction: { played: 10, wins: 6, losses: 4, winRate: 0.6 } } });
  });
  for (const width of [360, 375, 1280]) {
    await ash.page.setViewportSize({ width, height: width < 1000 ? 760 : 900 });
    await ash.page.goto("/perfil");
    await expect(ash.page.getByRole("list", { name: "Tus últimas subastas" }).getByRole("listitem")).toHaveCount(10);
    expect(await ash.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await ash.page.addScriptTag({ content: readFileSync(new URL("../../client/scripts/contrast-audit.js", import.meta.url), "utf8") });
    const report = await ash.page.evaluate(() => (window as unknown as { __contrastAuditAll(): Promise<Record<string, string[]>> }).__contrastAuditAll());
    expect(report).toEqual({ "clasico/claro": [], "clasico/oscuro": [], "pokedex/claro": [], "pokedex/oscuro": [] });
    await ash.page.screenshot({ path: testInfo.outputPath(`historial-${width}.png`), fullPage: true });
  }
});
