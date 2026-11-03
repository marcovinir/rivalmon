import { battleTurnDurationMs, battleTurnSteps, type BattleAction } from "@pokemon-minigames/shared";
import { describe, expect, it } from "vitest";
import { buildBattleFrames } from "../../src/game/battle-playback";
import type { BattleLogEntry } from "../../src/game/apply-event";
import { battleView } from "../helpers/battle";

const hit: BattleAction = { actor: 1, move: "tackle", moveName: "Placaje", damage: 30, critical: false, effectiveness: 1, healed: 0, actorHp: 100, targetHp: 70, missed: false, blocked: null, notes: [] };
const entry = (over: Partial<BattleLogEntry> = {}): BattleLogEntry => ({ round: 1, turn: 1, actions: [hit], names: { 1: "Uno", 2: "Cuatro" }, entered: [], switches: [], before: battleView(), roundNotes: [], roundNames: { 1: "Uno", 2: "Cuatro" }, entryNotes: [], endNotes: [], abilityNames: {}, ...over });

describe("los pasos compartidos del turno", () => {
  it("ordena entradas, cambios, acciones y efectos finales sin mutar el resultado", () => {
    const turn = entry({ switches: [{ seat: 1, pokemonId: 2 }], roundNotes: [{ kind: "ability", seat: 1, ability: "blaze" }], entryNotes: [{ kind: "stat", seat: 2, stat: "attack", change: -1 }], actions: [{ ...hit, notes: [{ kind: "status", seat: 2, status: "burn" }] }], endNotes: [{ kind: "residual", seat: 2, cause: "burn", damage: 6 }] });
    const copy = structuredClone(turn);
    expect(battleTurnSteps(turn).map((step) => step.kind)).toEqual(["note", "switch", "note", "windup", "action", "note", "note", "complete"]);
    expect(battleTurnDurationMs(turn)).toBe(900 + 700 + 900 + 1200 + 900 + 900 + 500);
    expect(turn).toEqual(copy);
  });

  it.each([{ missed: true }, { blocked: "sleep" as const }, { blocked: "paralysis" as const }, { effectiveness: 0 }, { damage: 0 }])("sin embestida ni golpe si no hay ataque: %j", (over) => {
    const steps = battleTurnSteps({ actions: [{ ...hit, ...over }] });
    expect(steps.map((step) => step.kind)).toEqual(["action", "complete"]);
    expect(steps[0]).toMatchObject({ attack: false, durationMs: 1200 });
  });

  it("hasta un turno vacío avanza, y los dos ataques conservan su orden", () => {
    expect(battleTurnDurationMs({ actions: [] })).toBe(500);
    const steps = battleTurnSteps({ actions: [{ ...hit, actor: 2 }, hit] });
    expect(steps.filter((step) => step.kind === "windup").map((step) => step.action.actor)).toEqual([2, 1]);
    expect(battleTurnDurationMs({ actions: [hit, hit] })).toBe(2900);
  });
});

describe("los cuadros presentados", () => {
  it("las notas de entrada del asalto ya estaban aplicadas en la vista inicial y no duplican sus stats", () => {
    const before = battleView({ myTeam: [{ ...battleView().myTeam[0]!, stages: { attack: -1 } }] });
    const turn = entry({ before, roundNotes: [{ kind: "stat", seat: 1, stat: "attack", change: -1 }] });
    expect(buildBattleFrames(before, turn, 1)[0]!.battle.myTeam[0]!.stages.attack).toBe(-1);
  });

  it("mantiene los PS hasta el impacto y separa retroceso y daño residual", () => {
    const turn = entry({ actions: [{ ...hit, actorHp: 90, notes: [{ kind: "recoil", seat: 1, damage: 10 }] }], endNotes: [{ kind: "residual", seat: 2, cause: "burn", damage: 6 }] });
    const frames = buildBattleFrames(turn.before!, turn, 1);
    const values = frames.map((frame) => [frame.battle.myTeam[0]!.hp, frame.battle.rivalTeam[0]!.hp]);
    expect(values).toEqual([[100, 100], [100, 70], [90, 70], [90, 64], [90, 64]]);
    expect(turn.before!.rivalTeam[0]!.hp).toBe(100);
  });

  it("un cambio muestra los PS previos de quien entra y después su golpe", () => {
    const turn = entry({ switches: [{ seat: 1, pokemonId: 2 }], names: { 1: "Dos", 2: "Cuatro" }, actions: [{ ...hit, actor: 2, actorHp: 100, targetHp: 70 }] });
    const frames = buildBattleFrames(turn.before!, turn, 1);
    expect(frames[0]!.battle.myTitular).toBe(2);
    expect(frames[0]!.battle.myTeam[1]!.hp).toBe(100);
    expect(frames[2]!.battle.myTeam[1]!.hp).toBe(70);
  });

  it("presenta curación, estados y niveles en el paso de su efecto", () => {
    const before = battleView({ myTeam: [{ ...battleView().myTeam[0]!, hp: 40 }] });
    const turn = entry({ before, actions: [{ ...hit, damage: 0, healed: 50, actorHp: 90, targetHp: 100, notes: [{ kind: "status", seat: 2, status: "poison" }, { kind: "stat", seat: 1, stat: "defense", change: 2 }] }] });
    const frames = buildBattleFrames(before, turn, 1);
    expect(frames[0]!.battle.myTeam[0]!.hp).toBe(90);
    expect(frames[0]!.battle.rivalTeam[0]!.status).toBeNull();
    expect(frames[1]!.battle.rivalTeam[0]!.status).toBe("poison");
    expect(frames[2]!.battle.myTeam[0]!.stages.defense).toBe(2);
    expect(frames[2]!.effects[1]).toBe("battle-boost-up");
  });

  it.each([{ missed: true }, { blocked: "sleep" as const }, { effectiveness: 0 }])("no aplica PS contradictorios cuando no hubo efecto: %j", (over) => {
    const turn = entry({ actions: [{ ...hit, ...over }] });
    const frames = buildBattleFrames(turn.before!, turn, 1);
    expect(frames[0]!.battle.rivalTeam[0]!.hp).toBe(100);
    expect(Object.values(frames[0]!.effects).some((effect) => effect === "battle-lunge" || effect === "battle-hit")).toBe(false);
  });

  it("desde el asiento 2 conserva qué barra pertenece al atacante", () => {
    const turn = entry({ actions: [{ ...hit, actor: 2, damage: 40, actorHp: 100, targetHp: 60 }] });
    const frames = buildBattleFrames(turn.before!, turn, 2);
    expect(frames[1]!.battle.myTeam[0]!.hp).toBe(100);
    expect(frames[1]!.battle.rivalTeam[0]!.hp).toBe(60);
  });
});
