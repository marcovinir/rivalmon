import type { BattleAction, BattleNote, BattleSwitch } from "./auction.js";

/** Solo el resultado público: esta secuencia no decide ni vuelve a resolver el combate. */
export interface BattleTurnPresentation {
  actions: BattleAction[];
  switches?: BattleSwitch[];
  roundNotes?: BattleNote[];
  entryNotes?: BattleNote[];
  endNotes?: BattleNote[];
}

export type BattleStep = { durationMs: number } & (
  | { kind: "switch"; change: BattleSwitch }
  | { kind: "windup"; action: BattleAction }
  | { kind: "action"; action: BattleAction; attack: boolean }
  | { kind: "note"; note: BattleNote; scope: "round" | "entry" | "action" | "end"; action?: BattleAction; lastInAction?: boolean }
  | { kind: "complete" }
);

/** Los dos extremos usan el mismo orden y los mismos tiempos, incluso con reducir movimiento. */
export function battleTurnSteps(turn: BattleTurnPresentation): BattleStep[] {
  const steps: BattleStep[] = [];
  const notes = (list: BattleNote[], scope: "round" | "entry" | "end") => {
    steps.push(...list.map((note): BattleStep => ({ kind: "note", note, scope, durationMs: 900 })));
  };
  notes(turn.roundNotes ?? [], "round");
  for (const change of turn.switches ?? []) steps.push({ kind: "switch", change, durationMs: 700 });
  notes(turn.entryNotes ?? [], "entry");
  for (const action of turn.actions) {
    const attack = action.damage > 0 && !action.missed && action.blocked === null && action.effectiveness !== 0;
    if (attack) steps.push({ kind: "windup", action, durationMs: 250 });
    steps.push({ kind: "action", action, attack, durationMs: attack ? 950 : 1200 });
    action.notes.forEach((note, index) => steps.push({ kind: "note", note, scope: "action", action, lastInAction: index === action.notes.length - 1, durationMs: 900 }));
  }
  notes(turn.endNotes ?? [], "end");
  // El resultado final (y el K.O., si corresponde) queda visible antes de que avance el servidor.
  steps.push({ kind: "complete", durationMs: 500 });
  return steps;
}

export function battleTurnDurationMs(turn: BattleTurnPresentation): number {
  return battleTurnSteps(turn).reduce((total, step) => total + step.durationMs, 0);
}
