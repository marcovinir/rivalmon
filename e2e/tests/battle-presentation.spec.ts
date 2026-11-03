import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
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
