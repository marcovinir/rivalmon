import { readFileSync } from "node:fs";
import type { BattleMove, Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { getMoveBook } from "../../src/game/auction/move-book.js";
import { AUCTION, AuctionHarness } from "./auction-harness.js";

/** #58: más información a mano en el combate, sin revelar lo que el rival aún no enseñó. */
const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const catalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

function toBattle(seed = 1): AuctionHarness {
  const h = new AuctionHarness({ seed, catalog, config: AUCTION });
  h.startGame();
  while (h.state.phase === "auction") h.noBids();
  h.dispatch({ type: "READY", seat: 1 });
  h.dispatch({ type: "READY", seat: 2 });
  for (const seat of [1, 2] as const) h.dispatch({ type: "CHOOSE_LINEUP", seat, order: [...h.state.teams[seat]] });
  return h;
}
const battle = (h: AuctionHarness, seat: Seat) => h.view(seat).auction!.battle!;
const titular = (h: AuctionHarness, seat: Seat) => h.state.battle!.fighters[seat].find((one) => one.pokemon.id === h.state.battle!.titular[seat])!;

describe("la descripción de los ataques", () => {
  it("volver a generar los movimientos conserva las descripciones", () => {
    const script = readFileSync(new URL("../../scripts/fetch-moves.ts", import.meta.url), "utf8");
    expect(script).toMatch(/descriptions/);
  });

  it("todos los movimientos de la instantánea tienen la suya en español", () => {
    const book = getMoveBook();
    for (const id of Object.keys(book.moves)) expect(book.descriptions?.[id], id).toMatch(/\S/);
  });

  it("los botones y mi equipo la traen", () => {
    const h = toBattle();
    for (const move of battle(h, 1).moves) expect(move.description).toBe(getMoveBook().descriptions?.[move.move]);
    for (const one of battle(h, 1).myTeam) for (const move of one.moves!) expect(move.description).toMatch(/\S/);
  });
});

describe("lo que se sabe del rival", () => {
  it("solo los ataques que ya usó, con los PP que gastó; nunca los demás", () => {
    const h = toBattle();
    const rival = titular(h, 2);
    const used = rival.moves[0]!;
    expect(battle(h, 1).rivalTeam.find((one) => one.pokemon.id === rival.pokemon.id)!.revealedMoves).toEqual([]);
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: battle(h, 1).moves[0]!.move });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: used.id as BattleMove });
    const view = battle(h, 1).rivalTeam.find((one) => one.pokemon.id === rival.pokemon.id)!;
    expect(view.revealedMoves).toEqual([{ move: used.id, name: getMoveBook().moves[used.id]!.names.es, type: getMoveBook().moves[used.id]!.type, ppUsed: 1 }]);
    expect(view.moves).toBeUndefined();
    // Cuántos tiene en total, para contar los que faltan por revelar (#68); cuáles, no.
    expect(view.moveCount).toBe(rival.moves.length);
    const hidden = rival.moves.slice(1).map((one) => one.id).filter((id) => !titular(h, 1).moves.some((mine) => mine.id === id));
    const text = JSON.stringify(battle(h, 1).rivalTeam);
    for (const id of hidden) expect(text).not.toContain(`"${id}"`);
  });

  it("de mi equipo no hace falta: lo veo entero", () => {
    const h = toBattle();
    for (const one of battle(h, 1).myTeam) expect(one.revealedMoves).toBeUndefined();
  });
});
