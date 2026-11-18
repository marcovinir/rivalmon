import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { TypeName } from "@pokemon-minigames/shared";
import { newPlayer, guestLogin } from "../support/app";
import { battlePresentation, presentationBattle, presentationHit } from "../support/battle-presentation";

for (const reduced of [false, true]) {
  test(`presentación real por pasos, con movimiento ${reduced ? "reducido" : "normal"}`, async ({ browser }, testInfo) => {
    const player = await newPlayer(browser, "a".repeat(24));
    const page = player.page;
    try {
      const fixture = await battlePresentation(page);
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await guestLogin(page, player.name);
      await page.goto("/sala/ABC234");
      await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toBeVisible();
      await expect.poll(() => page.getByRole("img", { name: "Bulbasaur" }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      await page.clock.install();
      await page.clock.pauseAt(new Date());

      for (const [index, width] of [360, 375, 1280].entries()) {
        const turn = index * 5 + 1;
        await page.setViewportSize({ width, height: width < 1000 ? 760 : 900 });
        const before = presentationBattle({ turn });
        fixture.state(before);
        await expect(page.getByRole("meter", { name: "PS de Charizard" })).toHaveAttribute("aria-valuenow", "100");
        await expect(page.locator(".battle-move").last()).toBeVisible();
        if (width === 360) for (const control of [page.locator(".battle-move").last(), page.getByRole("button", { name: /^Cambiar a/ }).last()]) {
          const box = await control.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width);
          expect(box!.y + box!.height + await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(760);
        }
        const final = presentationBattle({ turn, choosing: false, moves: [], myTeam: before.myTeam.map((one, index) => index === 0 ? { ...one, hp: 75, stages: { attack: 1, defense: 1 } } : one), rivalTeam: [{ ...before.rivalTeam[0]!, hp: 58, status: "poison" }] });
        fixture.resolve({ round: 1, turn, actions: [presentationHit({ notes: [{ kind: "status", seat: 2, status: "poison" }, { kind: "stat", seat: 1, stat: "attack", change: 1 }, { kind: "stat", seat: 1, stat: "defense", change: 1 }] }), presentationHit({ actor: 2, damage: 25, actorHp: 70, targetHp: 75 })], endNotes: [{ kind: "residual", seat: 2, cause: "poison", damage: 12 }] }, final);
        await expect(page.locator("[data-battle-step]")).toHaveAttribute("data-battle-step", "windup");
        await expect(page.getByRole("meter", { name: "PS de Charizard" })).toHaveAttribute("aria-valuenow", "100");
        await page.clock.runFor(249);
        await expect(page.getByRole("meter", { name: "PS de Charizard" })).toHaveAttribute("aria-valuenow", "100");
        await page.clock.runFor(1);
        await expect(page.getByRole("meter", { name: "PS de Charizard" })).toHaveAttribute("aria-valuenow", "70");
        const defender = page.getByRole("img", { name: "Charizard" }).locator("..");
        await expect(defender).toHaveClass(reduced ? "battle-flash" : "battle-hit");
        // Se inspecciona CSS calculado por el navegador, no solo la clase que jsdom puede ver.
        expect(await defender.evaluate((element) => getComputedStyle(element).animationName)).toContain(reduced ? "battle-blink" : "battle-shake");
        if (width < 640) {
          const message = await page.locator("[data-battle-step]").boundingBox();
          const sprite = await page.getByRole("img", { name: "Charizard" }).boundingBox();
          expect(message).not.toBeNull();
          expect(sprite).not.toBeNull();
          expect(message!.x + message!.width <= sprite!.x || message!.y + message!.height <= sprite!.y || message!.y >= sprite!.y + sprite!.height, "el texto deja visible al Pokémon rival").toBe(true);
        }
        await page.locator("[data-arena]").screenshot({ path: testInfo.outputPath(`${width}-impacto.png`) });
        await page.clock.runFor(950);
        await expect(page.locator("[data-battle-step]")).toHaveText("Charizard fue envenenado.");
        await expect(page.locator('[data-battle-status="poison"] img')).toBeVisible();
        await page.locator("[data-arena]").screenshot({ path: testInfo.outputPath(`${width}-veneno.png`) });
        await page.clock.runFor(900);
        await expect(page.locator(".battle-boost-up")).toBeVisible();
        const firstSignal = await page.locator(".battle-boost-up").evaluate((element) => getComputedStyle(element).animationName);
        await page.clock.runFor(900);
        await expect(page.locator("[data-battle-step]")).toContainText("Defensa");
        const secondSignal = await page.locator(".battle-boost-up").evaluate((element) => ({ name: getComputedStyle(element).animationName, active: element.getAnimations().length }));
        expect(secondSignal.name, "cada stat consecutivo reinicia su señal sobre el Pokémon").not.toBe(firstSignal);
        expect(secondSignal.active).toBeGreaterThan(0);
        await page.clock.runFor(900);
        await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toHaveAttribute("aria-valuenow", "100");
        await page.clock.runFor(250);
        await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toHaveAttribute("aria-valuenow", "75");
        await page.clock.runFor(950);
        await expect(page.getByRole("meter", { name: "PS de Charizard" })).toHaveAttribute("aria-valuenow", "58");
        await page.clock.runFor(1400);
        await expect(page.locator("[data-battle-step]")).toHaveCount(0);

        // Un fallo y un bloqueo se entienden sin embestida, golpe ni variación ficticia de PS.
        const idle = presentationBattle({ turn: turn + 1 });
        idle.rivalTeam[0] = { ...idle.rivalTeam[0]!, status: "sleep" };
        fixture.state(idle);
        await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toHaveAttribute("aria-valuenow", "100");
        fixture.resolve({ round: 1, turn: turn + 1, actions: [presentationHit({ missed: true, damage: 0, targetHp: 100 }), presentationHit({ actor: 2, blocked: "sleep", damage: 0, targetHp: 100 })] }, { ...idle, choosing: false, moves: [] });
        await expect(page.locator("[data-battle-step]")).toContainText("pero falló");
        await expect(page.locator(".battle-lunge, .battle-hit, .battle-flash")).toHaveCount(0);
        await page.clock.runFor(1200);
        await expect(page.locator("[data-battle-step]")).toContainText("no puede moverse");
        await expect(page.locator(".battle-lunge, .battle-hit, .battle-flash")).toHaveCount(0);
        await page.clock.runFor(1700);

        // La recarga durante el golpe recibe el estado final y no reproduce el último evento.
        const switching = presentationBattle({ turn: turn + 2 });
        fixture.state(switching);
        await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toBeVisible();
        fixture.resolve({ round: 1, turn: turn + 2, switches: [{ seat: 1, pokemonId: 25 }], actions: [presentationHit({ actor: 2, damage: 20, targetHp: 80 })] }, { ...switching, choosing: false, moves: [], myTitular: 25, myTeam: switching.myTeam.map((one) => one.pokemon.id === 25 ? { ...one, hp: 80 } : one) });
        await expect(page.getByRole("meter", { name: "PS de Pikachu" })).toHaveAttribute("aria-valuenow", "100");
        await page.clock.runFor(950);
        await expect(page.getByRole("meter", { name: "PS de Pikachu" })).toHaveAttribute("aria-valuenow", "80");
        await page.reload();
        await expect(page.getByRole("meter", { name: "PS de Pikachu" })).toHaveAttribute("aria-valuenow", "80");
        await expect(page.locator("[data-battle-step], .battle-lunge, .battle-hit, .battle-flash")).toHaveCount(0);
        if (reduced) expect(await page.getByRole("img", { name: "Pikachu" }).getAttribute("src")).not.toContain(".gif");
        // El auditor omite botones deshabilitados, pero no sus spans: se audita la elección,
        // donde el equipo está activo y no aparece ese falso positivo por opacidad de controles inactivos.
        fixture.state(presentationBattle({ turn: turn + 3 }));
        await expect(page.locator(".battle-move").last()).toBeVisible();
        await page.addScriptTag({ content: readFileSync(new URL("../../client/scripts/contrast-audit.js", import.meta.url), "utf8") });
        const auditing = page.evaluate(() => (window as unknown as { __contrastAuditAll(): Promise<Record<string, string[]>> }).__contrastAuditAll());
        await page.clock.runFor(500);
        const report = await auditing;
        expect(report).toEqual({ "clasico/claro": [], "clasico/oscuro": [], "pokedex/claro": [], "pokedex/oscuro": [] });
        for (const theme of ["clasico", "pokedex"]) for (const mode of ["claro", "oscuro"]) {
          await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; window.scrollTo(0, 0); }, { theme, mode });
          await page.screenshot({ path: testInfo.outputPath(`${width}-${theme}-${mode}.png`), fullPage: true });
        }
        if (width < 640) {
          const large = presentationBattle({ turn: turn + 4, myTitular: 321 });
          large.myTeam[0] = { ...large.myTeam[0]!, pokemon: { ...large.myTeam[0]!.pokemon, id: 321, names: { es: "Wailord", en: "Wailord" }, spriteUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/321.png" } };
          fixture.state(large);
          await expect.poll(() => page.getByRole("img", { name: "Wailord" }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
          // Medir tras la entrada: mientras escala desde 0,2 una caja parece caber aunque luego se recorte.
          await page.waitForTimeout(500);
          fixture.resolve({ round: 1, turn: turn + 4, actions: [presentationHit({ actor: 2, damage: 20, targetHp: 80 })] }, { ...large, choosing: false, moves: [], myTeam: large.myTeam.map((one) => one.pokemon.id === 321 ? { ...one, hp: 80 } : one) });
          await expect(page.locator("[data-battle-step]")).toBeVisible();
          const message = await page.locator("[data-battle-step]").boundingBox();
          const sprite = await page.getByRole("img", { name: "Wailord" }).boundingBox();
          expect(message!.y + message!.height, "la franja tampoco tapa un Pokémon propio grande").toBeLessThanOrEqual(sprite!.y);
          const arena = await page.locator("[data-arena]").boundingBox();
          expect(sprite!.x, "el sprite grande cabe también por la izquierda").toBeGreaterThanOrEqual(arena!.x);
          expect(sprite!.x + sprite!.width).toBeLessThanOrEqual(arena!.x + arena!.width);
          await page.locator("[data-arena]").screenshot({ path: testInfo.outputPath(`${width}-sprite-grande.png`) });
          await page.clock.runFor(1700);
        }
      }
    } finally {
      await player.context.close();
    }
  });
}

// #57: al caer un Pokémon no hay pausa ni K.O.; se elige al siguiente en la misma pantalla.
test("elegir al siguiente cabe a 360, 375 y escritorio, sin K.O. y con contraste en los 4 temas", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const player = await newPlayer(browser, "a".repeat(24));
  const page = player.page;
  try {
    const fixture = await battlePresentation(page);
    await guestLogin(page, player.name);
    await page.goto("/sala/ABC234");
    await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toBeVisible();
    for (const [index, width] of [360, 375, 1280].entries()) {
      await page.setViewportSize({ width, height: width < 1000 ? 760 : 900 });
      const base = presentationBattle({ turn: index + 2 });
      fixture.state({ ...base, choosing: false, moves: [], mustReplace: true, myTeam: base.myTeam.map((one, i) => (i === 0 || i === 2 ? { ...one, hp: 0 } : one)) });
      await expect(page.getByRole("heading", { name: "¿Quién sale ahora?" })).toBeVisible();
      await expect(page.getByText("K.O.", { exact: true })).toHaveCount(0);
      const options = page.locator("button.battle-replacement");
      await expect(options).toHaveCount(4);
      const scroll = await page.evaluate(() => window.scrollY);
      for (const option of await options.all()) {
        const box = await option.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        if (width < 1000) expect(box!.y + box!.height + scroll, "se alcanza sin desplazar en el móvil").toBeLessThanOrEqual(760);
      }
      // El debilitado se desvanece con su animación, calculada por el navegador.
      await expect.poll(() => page.locator(".battle-fainted > *").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("battle-faint");
      await page.waitForTimeout(700);
      // «Tu equipo» está desactivado mientras se elige al siguiente, y atenuado como al animar un turno: el auditor
      // omite los botones desactivados pero no sus textos (el mismo falso positivo que evita la prueba de arriba).
      // Se oculta solo durante la auditoría, que así mide lo nuevo: los botones del reemplazo y sus textos.
      const team = page.locator(`section[aria-label="Tu equipo"]`);
      await team.evaluate((node) => { (node as HTMLElement).style.visibility = "hidden"; });
      await page.addScriptTag({ content: readFileSync(new URL("../../client/scripts/contrast-audit.js", import.meta.url), "utf8") });
      const report = await page.evaluate(() => (window as unknown as { __contrastAuditAll(): Promise<Record<string, string[]>> }).__contrastAuditAll());
      expect(report).toEqual({ "clasico/claro": [], "clasico/oscuro": [], "pokedex/claro": [], "pokedex/oscuro": [] });
      await team.evaluate((node) => { (node as HTMLElement).style.visibility = ""; });
      for (const theme of ["clasico", "pokedex"]) for (const mode of ["claro", "oscuro"]) {
        await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; window.scrollTo(0, 0); }, { theme, mode });
        await page.screenshot({ path: testInfo.outputPath(`reemplazo-${width}-${theme}-${mode}.png`), fullPage: true });
      }
      // El rival, en cambio, sigue en la misma pantalla y sabe que estoy eligiendo.
      fixture.state({ ...base, choosing: false, moves: [], rivalReplacing: true });
      // El anuncio para el lector repite la frase: se busca la del panel, junto a la arena.
      await expect(page.locator("[data-arena] + div").getByText(`${"b".repeat(30)} está eligiendo a su siguiente Pokémon…`)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`rival-eligiendo-${width}.png`), fullPage: true });
    }
  } finally {
    await player.context.close();
  }
});

// #56: la alineación con datos, con los nombres de Pokémon y de ataques más largos que hay.
test("la alineación cabe a 360, 375 y escritorio con los nombres más largos, y el confirmar se alcanza", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const player = await newPlayer(browser, "a".repeat(24));
  const page = player.page;
  try {
    const fixture = await battlePresentation(page);
    await guestLogin(page, player.name);
    await page.goto("/sala/ABC234");
    await expect(page.getByRole("meter", { name: "PS de Bulbasaur" })).toBeVisible();
    const longest: [number, string][] = [[740, "Crabominable"], [931, "Squawkabilly"], [947, "Brambleghast"], [994, "Ferropolilla"], [1006, "Ferropaladín"], [1012, "Poltchageist"]];
    const moveNames = ["Tormenta de Diamantes", "Arenas Ardientes", "Cañón Resplandor", "Cabeza de Hierro"];
    const base = presentationBattle();
    const team = longest.map(([id, name]) => ({
      ...base.myTeam[0]!,
      pokemon: { ...base.myTeam[0]!.pokemon, id, names: { es: name, en: name }, types: ["steel", "fairy"] as TypeName[] },
      ability: { id: "intimidate", name: "Intimidación", description: "Baja el Ataque del rival al salir.", active: true },
      moves: moveNames.map((name, index) => ({ move: `m-${index}`, name, type: (["rock", "ground", "steel", "steel"] as const)[index]!, category: "physical" as const, power: 100, accuracy: 100, pp: 5, maxPp: 5, effectiveness: null, effect: null })),
    }));
    const rivals = longest.map(([id, name]) => ({ ...base.rivalTeam[0]!, pokemon: { ...base.rivalTeam[0]!.pokemon, id: id + 1, names: { es: name, en: name } } }));
    for (const width of [360, 375, 1280]) {
      await page.setViewportSize({ width, height: width < 1000 ? 760 : 900 });
      fixture.state({ ...base, round: 0, turn: 0, choosing: false, moves: [], myTitular: null, rivalTitular: null, deadline: Date.now() + 45_000, myTeam: team, rivalTeam: rivals }, "lineup");
      await expect(page.getByRole("heading", { name: "Elige tu alineación" })).toBeVisible();
      await page.waitForTimeout(400);
      for (const box of await Promise.all((await page.locator("button.lineup-card, ul[aria-label='Equipo rival'] li").all()).map((one) => one.boundingBox()))) {
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      // El botón de confirmar se queda pegado abajo: se alcanza sin bajar hasta el final.
      const confirm = await page.getByRole("button", { name: /^Confirmar orden/ }).boundingBox();
      expect(confirm!.y + confirm!.height, "el confirmar se ve sin desplazar").toBeLessThanOrEqual(width < 1000 ? 760 : 900);
      await page.locator("button.lineup-card").first().click();
      await page.addScriptTag({ content: readFileSync(new URL("../../client/scripts/contrast-audit.js", import.meta.url), "utf8") });
      const report = await page.evaluate(() => (window as unknown as { __contrastAuditAll(): Promise<Record<string, string[]>> }).__contrastAuditAll());
      expect(report).toEqual({ "clasico/claro": [], "clasico/oscuro": [], "pokedex/claro": [], "pokedex/oscuro": [] });
      for (const theme of ["clasico", "pokedex"]) for (const mode of ["claro", "oscuro"]) {
        await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; window.scrollTo(0, 0); }, { theme, mode });
        await page.screenshot({ path: testInfo.outputPath(`alineacion-${width}-${theme}-${mode}.png`), fullPage: true });
      }
    }
  } finally {
    await player.context.close();
  }
});
