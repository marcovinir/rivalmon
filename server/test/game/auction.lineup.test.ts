import { readFileSync } from "node:fs";
import type { Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { AUCTION, AuctionHarness } from "./auction-harness.js";

/** #56: la alineación con datos. Se numera a los Pokémon en el orden deseado, con 45 s. */
const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const catalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

function toLineup(seed = 1): AuctionHarness {
  const h = new AuctionHarness({ seed, catalog, config: AUCTION });
  h.startGame();
  while (h.state.phase === "auction") h.noBids();
  h.dispatch({ type: "READY", seat: 1 });
  h.dispatch({ type: "READY", seat: 2 });
  expect(h.state.phase).toBe("lineup");
  return h;
}

const battle = (h: AuctionHarness, seat: Seat) => h.view(seat).auction!.battle!;

describe("la alineación con datos", () => {
  it("dura 45 s", () => {
    const h = toLineup();
    expect(battle(h, 1).deadline).toBe(h.now + 45_000);
    h.advance(44_999);
    expect(h.state.phase).toBe("lineup");
    h.advance(1);
    expect(h.state.phase).toBe("battle");
  });

  it("mi equipo trae sus 4 ataques con sus PP; el del rival, ninguno", () => {
    const h = toLineup();
    for (const one of battle(h, 1).myTeam) {
      expect(one.moves).toHaveLength(4);
      for (const move of one.moves!) expect(move).toMatchObject({ name: expect.any(String), pp: move.maxPp, effectiveness: null });
    }
    for (const one of battle(h, 1).rivalTeam) expect(one.moves).toBeUndefined();
    // Ni en el texto: un ataque del rival no puede viajar en mi vista con ningún otro nombre.
    const rivalMoves = h.state.battle!.fighters[2].flatMap((fighter) => fighter.moves.map((move) => move.id));
    const mine = new Set(h.state.battle!.fighters[1].flatMap((fighter) => fighter.moves.map((move) => move.id)));
    const exclusive = rivalMoves.filter((id) => !mine.has(id));
    const text = JSON.stringify(battle(h, 1));
    for (const id of exclusive) expect(text).not.toContain(`"${id}"`);
  });

  it("en el combate, mis reservas también traen sus ataques con los PP que les quedan; el rival sigue sin ellos", () => {
    const h = toLineup();
    for (const seat of [1, 2] as const) h.dispatch({ type: "CHOOSE_LINEUP", seat, order: [...h.state.teams[seat]] });
    const reserve = h.state.battle!.fighters[1][1]!;
    reserve.moves[0]!.pp = 3;
    const view = battle(h, 1).myTeam.find((one) => one.pokemon.id === reserve.pokemon.id)!;
    expect(view.moves![0]!.pp).toBe(3);
    for (const one of battle(h, 1).rivalTeam) expect(one.moves).toBeUndefined();
  });
});

describe("el borrador del orden", () => {
  it("numerar a medias no confirma nada, se conserva al recargar y el rival no lo ve", () => {
    const h = toLineup();
    const [a, b] = h.state.teams[1];
    const effects = h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [b!, a!], draft: true });
    expect(effects.filter((one) => one.kind === "send_state" || one.kind === "emit")).toEqual([{ kind: "send_state", to: 1 }]);
    expect(battle(h, 1)).toMatchObject({ confirmed: false, myLineupDraft: [b, a] });
    expect(battle(h, 2).myLineupDraft).toBeNull();
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(battle(h, 1).myLineupDraft).toEqual([b, a]);
  });

  it("si se acaba el tiempo, los numerados van primero y los demás detrás, en orden de compra", () => {
    const h = toLineup();
    const team = h.state.teams[1];
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [team[3]!, team[1]!], draft: true });
    h.advance(45_000);
    expect(h.state.battle!.fighters[1].map((one) => one.pokemon.id)).toEqual([team[3], team[1], team[0], team[2], team[4], team[5]]);
    expect(h.state.battle!.titular[1]).toBe(team[3]);
  });

  it("un borrador con Pokémon ajenos o repetidos se rechaza; confirmar sigue pidiendo los 6", () => {
    const h = toLineup();
    const team = h.state.teams[1];
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [team[0]!, team[0]!], draft: true });
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [h.state.teams[2][0]!], draft: true });
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [team[0]!] });
    expect(h.errorCodes(1)).toEqual(["INVALID_CHOICE", "INVALID_CHOICE", "INVALID_CHOICE"]);
    expect(battle(h, 1).myLineupDraft).toBeNull();
  });

  it("un borrador que llega justo después de confirmar se ignora sin error", () => {
    const h = toLineup();
    const team = [...h.state.teams[1]];
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: team });
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [team[2]!], draft: true });
    expect(h.errorCodes(1)).toEqual([]);
    expect(battle(h, 1).myLineup).toEqual(team);
  });

  it("un borrador vacío quita todos los números", () => {
    const h = toLineup();
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [h.state.teams[1][2]!], draft: true });
    h.dispatch({ type: "CHOOSE_LINEUP", seat: 1, order: [], draft: true });
    expect(battle(h, 1).myLineupDraft).toEqual([]);
    h.advance(45_000);
    expect(h.state.battle!.titular[1]).toBe(h.state.teams[1][0]);
  });
});
