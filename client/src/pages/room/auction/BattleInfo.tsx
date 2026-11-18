import type { BattleFighterView, BattleMove, BattleMoveView } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { TypeChip } from "../../../components/TypeChip";
import { MOVE_COLORS, effectivenessLabel } from "../../../game/battle";
import { BATTLE_TEXT, TYPE_LABELS } from "../../../i18n/es";
import { TYPE_STYLES } from "../../../theme/type-styles";

/** Cuánto hay que mantener pulsado en el móvil para ver la descripción sin elegir el ataque. */
const LONG_PRESS_MS = 450;
/** Si el servidor no dice cuántos ataques tiene el rival (uno anterior a #68), los de siempre. */
const MOVES_PER_POKEMON = 4;

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const moveNote = (one: BattleMoveView): string => (one.effect && one.category === "status" ? one.effect : effectivenessLabel(one.effectiveness));

function moveFacts(one: BattleMoveView): string {
  const label = one.type ? capital(TYPE_LABELS[one.type]) : "";
  return [label, one.power ?? BATTLE_TEXT.noRoll, one.accuracy === null ? BATTLE_TEXT.noRoll : `${one.accuracy} %`].filter((part) => part !== "").join(" · ");
}

/**
 * Un botón de ataque (#58): el mismo contenido de siempre con un aspecto más moderno. La descripción sale con el cursor
 * (solo un ratón de verdad: tras un toque, el móvil simula uno), al mantener pulsado o con su «i»; un toque normal elige.
 */
export function MoveButton({ move, pressed, tipOpen, tipId, onChoose, onTip }: { move: BattleMoveView; pressed: boolean; tipOpen: boolean; tipId: string; onChoose(): void; onTip(open: boolean | "toggle"): void }) {
  const [color, edge] = MOVE_COLORS[move.type ?? "forcejeo"];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // Si el turno se resuelve con el dedo aún pulsado, el temporizador no debe abrir nada en el turno siguiente.
  useEffect(() => cancel, []);
  return (
    <div className="battle-move-slot">
      <button
        type="button"
        className="battle-move"
        style={{ background: color, boxShadow: `inset 0 -4px 0 ${edge}` }}
        aria-pressed={pressed}
        aria-describedby={tipOpen ? tipId : undefined}
        disabled={move.pp <= 0}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onTip(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onTip(false);
          cancel();
        }}
        onKeyDown={() => {
          longPressed.current = false;
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          longPressed.current = false;
          cancel();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onTip(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          // Tras mantener pulsado, soltar no elige el ataque: solo se quería leer su descripción.
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onChoose();
        }}
      >
        {/* Los espacios separan las partes en el nombre que oye el lector de pantalla. */}
        <span className="battle-move-name">{move.name}</span>{" "}
        <span className="block font-sans text-xs font-bold">{moveFacts(move)}</span>{" "}
        <span className="block font-sans text-xs font-extrabold">{moveNote(move)}</span>{" "}
        {move.type === null ? null : <span className="battle-move-pp">{BATTLE_TEXT.ppOf(move.pp, move.maxPp)}</span>}
      </button>
      {move.description ? (
        <button type="button" className="battle-move-info" aria-label={BATTLE_TEXT.moveInfo(move.name)} aria-expanded={tipOpen} aria-describedby={tipOpen ? tipId : undefined} onClick={() => onTip("toggle")}>
          i
        </button>
      ) : null}
    </div>
  );
}

/** La descripción del ataque abierto, encima de los botones para no tapar ninguno. */
export function MoveTip({ move, id }: { move: BattleMoveView; id: string }) {
  return (
    <div id={id} role="tooltip" className="battle-move-tip">
      <b className="font-display">{move.name}</b>
      {move.type ? <span className="ml-1.5 align-middle"><TypeChip type={move.type} size="sm" /></span> : null}
      <p className="m-0 mt-1">{move.description}</p>
      <p className="m-0 mt-1 font-bold">{BATTLE_TEXT.inRivalmon(move.effect)}</p>
    </div>
  );
}

/** La ficha de un Pokémon en combate: tipos, habilidad y ataques. Del rival, solo lo que ya enseñó, como en Showdown. */
export function FighterTip({ fighter, rival }: { fighter: BattleFighterView; rival: boolean }) {
  const revealed = fighter.revealedMoves ?? [];
  const hidden = (fighter.moveCount ?? MOVES_PER_POKEMON) - revealed.length;
  return (
    <div id="battle-tip" role="tooltip" className="battle-tip">
      <b className="block font-display">{fighter.pokemon.names.es}</b>
      <span className="my-1 flex flex-wrap gap-1">
        {fighter.pokemon.types.map((type) => <TypeChip key={type} type={type} size="sm" />)}
      </span>
      {fighter.ability ? (
        <span className="block">
          <b>{fighter.ability.name}</b>: {fighter.ability.description}
        </span>
      ) : null}
      <ul className="m-0 mt-1 list-none p-0">
        {rival
          ? revealed.map((move) => <li key={move.move}>{BATTLE_TEXT.ppSpent(move.name, move.ppUsed)}</li>)
          : (fighter.moves ?? []).map((move) => (
              <li key={move.move} className="flex justify-between gap-2">
                <span>{move.name}</span>
                <span className="font-num font-bold">{BATTLE_TEXT.ppOf(move.pp, move.maxPp)}</span>
              </li>
            ))}
        {rival && hidden > 0 ? <li className="opacity-80">{BATTLE_TEXT.hiddenMoves(hidden)}</li> : null}
      </ul>
    </div>
  );
}

/** Tipos y ataques de todo mi equipo, plegados para no quitar sitio al combate en el móvil. */
export function TeamInfo({ team }: { team: BattleFighterView[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button type="button" className="text-xs font-extrabold underline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? BATTLE_TEXT.teamInfoHide : BATTLE_TEXT.teamInfo}
      </button>
      {open ? (
        <ul aria-label={BATTLE_TEXT.teamInfoList} className="m-0 mt-1.5 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2 lg:grid-cols-1">
          {team.map((one) => (
            <li key={one.pokemon.id} className="rounded-lg bg-surface-2 p-1.5 text-xs">
              <span className="flex flex-wrap items-center gap-1">
                <b className="font-display text-sm">{one.pokemon.names.es}</b>
                {one.pokemon.types.map((type) => <TypeChip key={type} type={type} size="sm" />)}
              </span>
              <ul className="m-0 mt-1 list-none p-0">
                {(one.moves ?? []).map((move) => (
                  <li key={move.move} className="flex items-center gap-1">
                    <span aria-hidden="true" className="size-2 flex-none rounded-full" style={move.type ? { background: TYPE_STYLES[move.type].background } : undefined} />
                    <span className="min-w-0 flex-1">{move.name}</span>
                    <span className="font-num font-bold">{BATTLE_TEXT.ppOf(move.pp, move.maxPp)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type MoveTipState = BattleMove | null;
