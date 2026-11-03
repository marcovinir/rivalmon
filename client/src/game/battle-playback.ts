import { battleTurnSteps, type BattleAction, type BattleFighterView, type BattleNote, type BattleStep, type BattleView, type Seat } from "@pokemon-minigames/shared";
import type { BattleLogEntry } from "./apply-event";
import { actionLine, noteLine } from "./battle";
import { rivalSeat } from "./seats";

export interface BattleFrame {
  battle: BattleView;
  step: BattleStep;
  text: string;
  effects: Partial<Record<Seat, string>>;
}

/** Cuadros inmutables de lo ya resuelto; los PS publicados son puntos de control, no otra fórmula de daño. */
export function buildBattleFrames(before: BattleView, entry: BattleLogEntry, mySeat: Seat): BattleFrame[] {
  let battle: BattleView = { ...before, choosing: false, moves: [], warningUntil: null };
  const update = (seat: Seat, change: (fighter: BattleFighterView) => BattleFighterView) => {
    const team = seat === mySeat ? "myTeam" : "rivalTeam";
    const id = seat === mySeat ? battle.myTitular : battle.rivalTitular;
    battle = { ...battle, [team]: battle[team].map((fighter) => fighter.pokemon.id === id ? change(fighter) : fighter) };
  };
  const hp = (seat: Seat, change: (current: number) => number) => update(seat, (fighter) => ({ ...fighter, hp: Math.max(0, Math.min(fighter.maxHp, change(fighter.hp))) }));
  const checkpoint = (action: BattleAction) => {
    if (action.missed || action.blocked || (action.effectiveness === 0 && action.notes.length === 0)) return;
    hp(action.actor, () => action.actorHp);
    hp(rivalSeat(action.actor), () => action.targetHp);
  };
  const applyNote = (note: BattleNote) => {
    if (note.kind === "failed") return;
    if (note.kind === "recoil" || note.kind === "residual") hp(note.seat, (current) => current - note.damage);
    else if (note.kind === "healed") hp(note.seat, (current) => current + note.amount);
    else if (note.kind === "status") update(note.seat, (fighter) => ({ ...fighter, status: note.status }));
    else if (note.kind === "woke") update(note.seat, (fighter) => ({ ...fighter, status: null }));
    else if (note.kind === "stat") update(note.seat, (fighter) => {
      const stage = Math.max(-6, Math.min(6, (fighter.stages[note.stat] ?? 0) + note.change));
      return { ...fighter, stages: { ...fighter.stages, [note.stat]: stage } };
    });
  };
  return battleTurnSteps(entry).map((step): BattleFrame => {
    let text = "El turno terminó.";
    const effects: BattleFrame["effects"] = {};
    switch (step.kind) {
      case "switch": {
        const key = step.change.seat === mySeat ? "myTitular" : "rivalTitular";
        battle = { ...battle, [key]: step.change.pokemonId };
        update(step.change.seat, (fighter) => ({ ...fighter, stages: {} }));
        text = `¡Adelante, ${entry.names[step.change.seat]}!`;
        break;
      }
      case "windup":
        text = `${entry.names[step.action.actor]} usó ${step.action.moveName}.`;
        effects[step.action.actor] = "battle-lunge";
        break;
      case "action": {
        const { action } = step;
        text = actionLine(action, entry.names);
        if (!action.missed && !action.blocked) {
          if (step.attack) hp(rivalSeat(action.actor), (current) => current - action.damage);
          if (action.effectiveness !== 0) hp(action.actor, (current) => current + action.healed);
          if (action.notes.length === 0) checkpoint(action);
        }
        if (step.attack) effects[rivalSeat(action.actor)] = "battle-hit";
        else if (action.blocked) effects[action.actor] = `battle-afflicted-${action.blocked}`;
        else if (action.healed > 0) effects[action.actor] = "battle-heal";
        break;
      }
      case "note": {
        const names = step.scope === "round" ? entry.roundNames : entry.names;
        text = noteLine(step.note, names, entry.abilityNames);
        // El room-state inicial del asalto ya incluía sus habilidades de entrada.
        if (step.scope !== "round") applyNote(step.note);
        if (step.lastInAction && step.action) checkpoint(step.action);
        const note = step.note;
        if (note.kind === "status") effects[note.seat] = `battle-afflicted-${note.status}`;
        else if (note.kind === "residual") effects[note.seat] = `battle-afflicted-${note.cause}`;
        else if (note.kind === "stat") effects[note.seat] = note.change > 0 ? "battle-boost-up" : "battle-boost-down";
        else if (note.kind === "healed") effects[note.seat] = "battle-heal";
        else if (note.kind === "recoil") effects[note.seat] = "battle-flash";
        break;
      }
      case "complete":
        break;
    }
    return { battle, step, text, effects };
  });
}
