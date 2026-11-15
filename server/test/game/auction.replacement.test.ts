import { readFileSync } from "node:fs";
import type { BattleMove, Seat } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import { AUCTION, AuctionHarness } from "./auction-harness.js";

/** #57: el combate sigue al caer un Pokémon. Solo elige quien lo perdió, desde la misma pantalla. */
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
const moveOf = (h: AuctionHarness, seat: Seat): BattleMove => battle(h, seat).moves.find((one) => one.category !== "status" && one.pp > 0)?.move ?? battle(h, seat).moves.find((one) => one.pp > 0)?.move ?? "tackle";
const titular = (h: AuctionHarness, seat: Seat) => h.state.battle!.fighters[seat].find((one) => one.pokemon.id === h.state.battle!.titular[seat])!;
const reserves = (h: AuctionHarness, seat: Seat) => h.state.battle!.fighters[seat].filter((one) => one.hp > 0 && one.pokemon.id !== h.state.battle!.titular[seat]);

function finishAnimation(h: AuctionHarness): void {
  const pending = h.pending.find((one) => one.timer.kind === "battle" && one.timer.step === h.state.battle!.step);
  if (!pending) throw new Error("Falta el temporizador de la animación");
  h.advance(pending.at - h.now);
}

function chooseBoth(h: AuctionHarness): void {
  h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: moveOf(h, 1) });
  h.dispatch({ type: "CHOOSE_MOVE", seat: 2, move: moveOf(h, 2) });
}

/** Deja al titular de `seat` con 1 PS y envenenado, para que caiga al final del turno. */
function doomed(h: AuctionHarness, seat: Seat): void {
  const fighter = titular(h, seat);
  fighter.hp = 1;
  fighter.status = "poison";
}

/** Juega un turno en que cae el titular de `seat` y deja pasar su animación. */
function faint(h: AuctionHarness, seat: Seat): void {
  doomed(h, seat);
  const other: Seat = seat === 1 ? 2 : 1;
  titular(h, other).hp = titular(h, other).maxHp = 5000;
  chooseBoth(h);
  finishAnimation(h);
}

describe("al caer un Pokémon", () => {
  it("no hay pausa: sigue el combate, sin movimientos, y solo elige quien lo perdió", () => {
    const h = toBattle();
    faint(h, 1);
    expect(h.state.phase).toBe("battle");
    expect(h.payloads("battle-fainted")).toEqual([{ fallen: [1], atLimit: false }]);
    expect(h.payloads("battle-turn").at(-1)!.endNotes!.at(-1)).toEqual({ kind: "fainted", seat: 1, atLimit: false });
    expect(battle(h, 1)).toMatchObject({ mustReplace: true, rivalReplacing: false, choosing: false, moves: [] });
    expect(battle(h, 2)).toMatchObject({ mustReplace: false, rivalReplacing: true, choosing: false, moves: [] });
  });

  it("elegir al siguiente lo hace entrar en un tramo nuevo, sin gastar turno, y luego se elige movimiento", () => {
    const h = toBattle();
    faint(h, 1);
    const turn = h.state.battle!.turn;
    const next = reserves(h, 1)[1]!.pokemon.id;
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: next });
    expect(h.payloads("battle-turn").at(-1)).toMatchObject({ round: 2, turn, actions: [], switches: [{ seat: 1, pokemonId: next }] });
    expect(h.state.battle!.titular[1]).toBe(next);
    expect(battle(h, 1).choosing).toBe(false);
    finishAnimation(h);
    expect(battle(h, 1)).toMatchObject({ choosing: true, turn: turn + 1, mustReplace: false });
    expect(battle(h, 2)).toMatchObject({ choosing: true, rivalReplacing: false, rivalTitular: next });
  });

  it("el superviviente conserva sus niveles de stats y su estado", () => {
    const h = toBattle();
    faint(h, 1);
    titular(h, 2).stages.attack = 2;
    titular(h, 2).status = "burn";
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserves(h, 1)[0]!.pokemon.id });
    finishAnimation(h);
    expect(titular(h, 2).stages.attack).toBe(2);
    expect(titular(h, 2).status).toBe("burn");
  });

  it("solo quien perdió elige, y solo a un Pokémon suyo y vivo; mientras, nadie elige movimiento", () => {
    const h = toBattle();
    faint(h, 1);
    const fallen = h.state.battle!.titular[1]!;
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 2, pokemonId: reserves(h, 2)[0]!.pokemon.id });
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: fallen });
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: h.state.teams[2][0]! });
    h.dispatch({ type: "CHOOSE_MOVE", seat: 1, move: "tackle" });
    expect(h.errorCodes(2)).toEqual(["WRONG_PHASE"]);
    expect(h.errorCodes(1)).toEqual(["INVALID_CHOICE", "INVALID_CHOICE", "WRONG_PHASE"]);
    expect(h.state.battle!.titular[1]).toBe(fallen);
  });

  it("al elegir solo se actualiza quien eligió", () => {
    const h = toBattle();
    doomed(h, 1);
    doomed(h, 2);
    chooseBoth(h);
    finishAnimation(h);
    const effects = h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: reserves(h, 1)[0]!.pokemon.id });
    expect(effects.filter((one) => one.kind === "send_state" || one.kind === "emit")).toEqual([{ kind: "send_state", to: 1 }]);
  });
});

describe("si caen los dos a la vez", () => {
  it("eligen los dos, en secreto, y entran a la vez", () => {
    const h = toBattle();
    doomed(h, 1);
    doomed(h, 2);
    chooseBoth(h);
    expect(h.payloads("battle-fainted")).toEqual([{ fallen: [1, 2], atLimit: false }]);
    expect(h.payloads("battle-turn").at(-1)!.endNotes!.slice(-2)).toEqual([{ kind: "fainted", seat: 1, atLimit: false }, { kind: "fainted", seat: 2, atLimit: false }]);
    finishAnimation(h);
    expect(battle(h, 1)).toMatchObject({ mustReplace: true, rivalReplacing: true });
    const [a, b] = [reserves(h, 1)[0]!.pokemon.id, reserves(h, 2)[0]!.pokemon.id];
    const rivalBefore = JSON.stringify(battle(h, 2).rivalTitular);
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: a });
    expect(battle(h, 1).myReplacement).toBe(a);
    expect(battle(h, 2).myReplacement).toBeNull();
    expect(JSON.stringify(battle(h, 2).rivalTitular)).toBe(rivalBefore);
    expect(JSON.stringify(h.view(2))).not.toContain(`"myReplacement":${a}`);
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 2, pokemonId: b });
    expect(h.payloads("battle-turn").at(-1)!.switches).toEqual([{ seat: 1, pokemonId: a }, { seat: 2, pokemonId: b }]);
    expect(h.state.battle!.titular).toEqual({ 1: a, 2: b });
  });

  it("si nadie de los dos tiene más, pierde el más lento", () => {
    const h = toBattle();
    for (const seat of [1, 2] as const) for (const one of reserves(h, seat)) one.hp = 0;
    doomed(h, 1);
    doomed(h, 2);
    titular(h, 1).pokemon.stats.speed = 10;
    titular(h, 2).pokemon.stats.speed = 200;
    chooseBoth(h);
    finishAnimation(h);
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "completed" });
  });
});

describe("sin reloj para elegir al siguiente", () => {
  it("avisa a los 60 s y, si no responde, sale el primero vivo de su orden", () => {
    const h = toBattle();
    faint(h, 1);
    const first = reserves(h, 1)[0]!.pokemon.id;
    h.advance(60_000);
    expect(battle(h, 1).warningUntil).toBe(h.now + 15_000);
    expect(battle(h, 2).warningUntil).toBeNull();
    expect(battle(h, 2).rivalIdle).toBe(true);
    h.advance(15_000);
    expect(h.state.battle!.titular[1]).toBe(first);
  });

  it("«Sigo aquí» vuelve a dar tiempo, y recargar conserva lo elegido", () => {
    const h = toBattle();
    doomed(h, 1);
    doomed(h, 2);
    chooseBoth(h);
    finishAnimation(h);
    h.advance(60_000);
    h.dispatch({ type: "STILL_HERE", seat: 1, turnId: battle(h, 1).stepId });
    expect(battle(h, 1).warningUntil).toBeNull();
    const pick = reserves(h, 1)[1]!.pokemon.id;
    h.dispatch({ type: "CHOOSE_SWITCH", seat: 1, pokemonId: pick });
    h.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    h.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
    expect(battle(h, 1)).toMatchObject({ mustReplace: true, myReplacement: pick, confirmed: true });
  });
});

describe("el límite de turnos", () => {
  it("a los 20 turnos seguidos sin caídas cae quien tiene menos PS; el contador empieza de nuevo", () => {
    const h = toBattle();
    for (const seat of [1, 2] as const) for (const one of h.state.battle!.fighters[seat]) one.hp = one.maxHp = 5000;
    for (let turn = 0; turn < 19; turn++) {
      chooseBoth(h);
      finishAnimation(h);
    }
    expect(battle(h, 1).calmTurns).toBe(19);
    expect(h.payloads("battle-fainted")).toEqual([]);
    chooseBoth(h);
    expect(h.payloads("battle-fainted")).toEqual([{ fallen: [expect.any(Number)], atLimit: true }]);
    const loser = h.payloads("battle-fainted")[0]!.fallen[0]! as Seat;
    // La nota va en el mismo turno: la animación baja la barra a 0 y explica por qué.
    expect(h.payloads("battle-turn").at(-1)!.endNotes!.at(-1)).toEqual({ kind: "fainted", seat: loser, atLimit: true });
    finishAnimation(h);
    h.dispatch({ type: "CHOOSE_SWITCH", seat: loser, pokemonId: reserves(h, loser)[0]!.pokemon.id });
    finishAnimation(h);
    expect(battle(h, 1)).toMatchObject({ calmTurns: 0, turn: 21 });
  });
});

describe("el final", () => {
  it("quien se queda sin Pokémon vivos pierde al acabar la animación", () => {
    const h = toBattle();
    for (const one of reserves(h, 1)) one.hp = 0;
    faint(h, 1);
    expect(h.state.outcome).toEqual({ winnerSeat: 2, reason: "completed" });
  });
});
