import type { BattleFighterView, BattleMove, Seat } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { spriteUrl } from "../../../catalog/artwork";
import { BATTLE_MAX_TURNS } from "../../../game/durations";
import { turnLines } from "../../../game/battle";
import { useReducedMotion } from "../../../game/motion";
import { rivalSeat } from "../../../game/seats";
import { BATTLE_TEXT } from "../../../i18n/es";
import { useLastSeconds } from "../../../sound/use-last-seconds";
import { LeaveButton } from "../LeaveButton";
import { focusWasLost } from "../RematchPanel";
import { useRoom } from "../use-room";
import { FighterTip, MoveButton, MoveTip, TeamInfo } from "./BattleInfo";
import { BattleSprite } from "./BattleSprite";
import { AttackEffect } from "../../../components/AttackEffect";
import { HpBar } from "./HpBar";
import { InactivityWarning } from "./InactivityWarning";
import { useBattlePlayback } from "./use-battle-playback";

const standing = (team: BattleFighterView[]): number => team.filter((one) => one.hp > 0).length;

/** El combate con el aspecto de Showdown: tu Pokémon de espaldas abajo, el rival de frente arriba, y sin reloj para elegir. */
export function BattleScreen() {
  const { view, client } = useRoom();
  const reduced = useReducedMotion();
  const authoritative = view.auction?.battle;
  const last = view.battleLog[view.battleLog.length - 1] ?? null;
  // Solo el turno en curso: al recargar, la pantalla se monta de nuevo con el último golpe en el registro.
  const current = last && authoritative && last.round === authoritative.round && last.turn === authoritative.turn ? last : null;
  const playback = useBattlePlayback(current, authoritative, view.mySeat ?? 1);
  const battle = playback.battle;
  const movesRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<"mine" | "theirs" | null>(null);
  // La descripción abierta de un ataque (#58): solo una a la vez, y se va con los botones al resolverse el turno.
  const [moveTip, setMoveTip] = useState<BattleMove | null>(null);
  const titulars = `${battle?.myTitular}-${battle?.rivalTitular}`;
  // Al entrar otro Pokémon el sprite se monta de nuevo sin avisar de que se fue el cursor.
  useEffect(() => setTip(null), [titulars]);
  // En un móvil nada avisa de que se tocó fuera: el foco no siempre se mueve.
  useEffect(() => {
    if (tip === null) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("[data-ability-sprite]")) setTip(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tip]);
  const choosing = battle?.choosing ?? false;
  const moveTurn = choosing ? `${battle?.round}-${battle?.turn}` : null;
  useEffect(() => setMoveTip(null), [moveTurn]);
  useEffect(() => {
    if (moveTip === null) return;
    const closeByKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoveTip(null);
    };
    // En el móvil no hay cursor que se vaya: tocar fuera de los botones la cierra.
    const closeByTouch = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.(".battle-move-slot")) setMoveTip(null);
    };
    document.addEventListener("keydown", closeByKey);
    document.addEventListener("pointerdown", closeByTouch);
    return () => {
      document.removeEventListener("keydown", closeByKey);
      document.removeEventListener("pointerdown", closeByTouch);
    };
  }, [moveTip]);
  // Se llega pulsando «Confirmar», más abajo: en el móvil el escenario quedaría cortado.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const warningUntil = battle?.warningUntil ?? null;
  // Solo hay urgencia con el aviso abierto: suena a los últimos segundos, una vez por aviso.
  useLastSeconds({ deadline: warningUntil, offset: view.clockOffset, answered: warningUntil === null, round: warningUntil ?? 0 });
  // También al responder el aviso: su botón desaparece.
  const turnKey = choosing && warningUntil === null ? `${battle?.round}-${battle?.turn}` : null;
  // Un turno nuevo vuelve a poner los botones: si el foco se perdió con ellos, regresa.
  useEffect(() => {
    if (turnKey !== null && focusWasLost()) movesRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [turnKey]);
  // Igual al tener que elegir al siguiente: los botones de ataque ya no están.
  const replaceKey = battle?.mustReplace && battle.myReplacement === null && !playback.busy ? `${battle.round}-${battle.turn}` : null;
  useEffect(() => {
    if (replaceKey !== null && focusWasLost()) document.querySelector<HTMLButtonElement>("button.battle-replacement:not(:disabled)")?.focus({ preventScroll: true });
  }, [replaceKey]);
  if (!battle || view.mySeat === null) return null;

  const mySeat = view.mySeat;
  const rival = rivalSeat(mySeat);
  const rivalName = view.players.find((player) => player.seat === rival)?.username ?? "";
  const mine = battle.myTeam.find((one) => one.pokemon.id === battle.myTitular);
  const theirs = battle.rivalTeam.find((one) => one.pokemon.id === battle.rivalTitular);
  const effectOf = (seat: Seat): string => {
    const effect = playback.frame?.effects[seat] ?? "";
    if (effect === "battle-hit") return reduced ? "battle-flash" : effect;
    if (effect === "battle-lunge") return reduced ? "" : seat === mySeat ? effect : `${effect} battle-lunge-left`;
    // Dos notas seguidas deben reiniciar el pulso sin remontar el sprite ni reiniciar su GIF.
    if (effect.startsWith("battle-afflicted-") || effect.startsWith("battle-boost-") || effect === "battle-heal") {
      return (playback.index ?? 0) % 2 ? `${effect} battle-cue-alt` : effect;
    }
    return effect;
  };
  // Sin rótulo de K.O. (#57): el debilitado se desvanece con el golpe que lo deja a 0 y sigue así hasta que lo sustituyen.
  const faded = (fighter: BattleFighterView): boolean => fighter.hp <= 0;
  const replacing = battle.mustReplace && !playback.busy;
  const lines = [...view.battleLog].reverse().flatMap((entry) => turnLines(entry.actions, entry.names, entry).map((line, index) => ({ key: `${entry.round}-${entry.turn}-${index}`, line })));
  const tipFighter = tip === "mine" ? mine : tip === "theirs" ? theirs : undefined;
  const openMove = choosing ? battle.moves.find((one) => one.move === moveTip) : undefined;
  const prompt = replacing ? (battle.myReplacement !== null && battle.rivalReplacing ? BATTLE_TEXT.waitingFor(rivalName) : "") : battle.rivalReplacing && !playback.busy ? BATTLE_TEXT.rivalReplacing(rivalName) : !choosing ? BATTLE_TEXT.resolving : battle.rivalIdle ? BATTLE_TEXT.rivalSlow(rivalName) : battle.confirmed ? BATTLE_TEXT.waitingFor(rivalName) : mine ? BATTLE_TEXT.whatDoes(mine.pokemon.names.es) : "";

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-3">
      <div className="flex min-w-0 flex-col gap-2 lg:gap-3">
        <div data-arena className="battle-arena relative h-64 overflow-hidden rounded-xl bg-[#1b1147] sm:aspect-video sm:h-auto lg:aspect-auto lg:h-[30rem]">
          <img src={`/auction/combate-${battle.scene}.png`} alt="" className="absolute inset-0 size-full object-cover [image-rendering:pixelated]" />
          {theirs ? <BattleSprite key={theirs.pokemon.id} id={theirs.pokemon.id} name={theirs.pokemon.names.es} side="front" status={theirs.status} effect={effectOf(rival)} fainted={faded(theirs)} showsAbility describedBy={tip === "theirs" ? "battle-tip" : undefined} onAbility={(open) => setTip(open ? "theirs" : null)} /> : null}
          {mine ? <BattleSprite key={mine.pokemon.id} id={mine.pokemon.id} name={mine.pokemon.names.es} side="back" status={mine.status} effect={effectOf(mySeat)} fainted={faded(mine)} showsAbility describedBy={tip === "mine" ? "battle-tip" : undefined} onAbility={(open) => setTip(open ? "mine" : null)} /> : null}
          {playback.frame?.projectile ? <AttackEffect key={playback.index} type={playback.frame.projectile.type} from={playback.frame.projectile.from} /> : null}
          {playback.frame ? <p aria-hidden="true" data-battle-step={playback.frame.step.kind} data-battle-step-index={playback.index} className="battle-step">{playback.frame.text}</p> : null}
          {theirs ? (
            <div className="absolute top-1.5 left-1.5 w-44 lg:top-4 lg:left-4 lg:w-72">
              <HpBar fighter={theirs} standing={standing(battle.rivalTeam)} percentOnly />
            </div>
          ) : null}
          {mine ? (
            <div className="absolute right-1.5 bottom-1.5 w-44 lg:right-4 lg:bottom-4 lg:w-72">
              <HpBar fighter={mine} standing={standing(battle.myTeam)} />
            </div>
          ) : null}
          <p className="absolute top-1.5 right-1.5 m-0 max-w-28 rounded-md bg-[#1b1147] px-1.5 py-0.5 text-center font-num text-xs font-bold text-white lg:top-4 lg:right-4 lg:max-w-none lg:px-2 lg:py-1 lg:text-base">{BATTLE_TEXT.turnLabel(battle.turn, battle.calmTurns, BATTLE_MAX_TURNS)}</p>
          {tipFighter ? <FighterTip fighter={tipFighter} rival={tip === "theirs"} /> : null}
          {battle.warningUntil !== null ? <InactivityWarning until={battle.warningUntil} offset={view.clockOffset} onStillHere={() => client.stillHere(battle.stepId)} /> : null}
        </div>

        <div className="rounded-xl bg-surface p-2 lg:p-3">
          {replacing ? <h2 className="m-0 mb-1.5 font-display text-base font-semibold">{BATTLE_TEXT.whoNext}</h2> : null}
          {prompt ? <p className="m-0 mb-1.5 text-sm font-extrabold">{prompt}</p> : null}
          {replacing ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3 lg:gap-2">
                {battle.myTeam.filter((one) => one.hp > 0 && one.pokemon.id !== battle.myTitular).map((one) => (
                  <button key={one.pokemon.id} type="button" aria-label={BATTLE_TEXT.sendOut(one.pokemon.names.es)} aria-pressed={battle.myReplacement === one.pokemon.id} disabled={battle.myReplacement !== null} onClick={() => client.switchTo(one.pokemon.id)} className="battle-replacement">
                    <img src={spriteUrl(one.pokemon.id)} alt="" className="size-10 flex-none [image-rendering:pixelated]" />
                    <span aria-hidden="true" className="min-w-0 text-left">
                      <span className="block font-display text-sm font-semibold [overflow-wrap:anywhere]">{one.pokemon.names.es}</span>
                      <span className="block font-num text-xs font-bold">{Math.round((one.hp / one.maxHp) * 100)} %</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="m-0 mt-1.5 text-xs text-muted">{BATTLE_TEXT.replaceSecret}</p>
            </>
          ) : null}
          {choosing ? (
            <div className="relative">
              {openMove?.description ? <MoveTip move={openMove} id="move-tip" /> : null}
              <div ref={movesRef} className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2">
                {battle.moves.map((one) => (
                  <MoveButton
                    key={one.move}
                    move={one}
                    pressed={battle.myMove === one.move}
                    tipOpen={moveTip === one.move && Boolean(one.description)}
                    tipId="move-tip"
                    onChoose={() => client.move(one.move)}
                    onTip={(open) => setMoveTip((current) => (open === "toggle" ? (current === one.move ? null : one.move) : open ? one.move : current === one.move ? null : current))}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-2 lg:gap-3">
        <section aria-label={BATTLE_TEXT.yourTeam} className="order-1 rounded-xl bg-surface p-2 lg:order-2 lg:p-3">
          <p className="m-0 mb-1 text-sm font-extrabold">{BATTLE_TEXT.switchCost}</p>
          <div className="grid grid-cols-6 gap-1 lg:grid-cols-2 lg:gap-1.5">
            {battle.myTeam.map((one) => {
              const name = one.pokemon.names.es;
              const percent = Math.round((one.hp / one.maxHp) * 100);
              const fainted = one.hp <= 0;
              const active = one.pokemon.id === battle.myTitular;
              const label = active ? BATTLE_TEXT.inBattle(name) : fainted ? BATTLE_TEXT.fainted(name) : BATTLE_TEXT.switchTo(name, percent);
              return (
                <button key={one.pokemon.id} type="button" aria-label={label} aria-pressed={battle.mySwitch === one.pokemon.id} disabled={fainted || active || !choosing} data-active={active || undefined} data-fainted={fainted || undefined} onClick={() => client.switchTo(one.pokemon.id)} className="battle-team-member flex-col lg:flex-row">
                  <img src={spriteUrl(one.pokemon.id)} alt="" className="size-8 flex-none [image-rendering:pixelated] lg:size-11" />
                  <span aria-hidden="true" className="min-w-0 text-left text-xs leading-tight font-extrabold">
                    <span className="hidden truncate lg:block">{name}</span>
                    <span className="font-num">{percent} %</span>
                  </span>
                </button>
              );
            })}
          </div>
          <TeamInfo team={battle.myTeam} />
        </section>
        <section className="order-2 min-h-0 rounded-xl bg-surface p-2 lg:order-1 lg:flex-1 lg:p-3">
          <p aria-hidden="true" className="m-0 mb-1 hidden font-display text-base font-semibold lg:block">{BATTLE_TEXT.log}</p>
          <div data-battle-log aria-hidden="true" className="h-24 overflow-y-auto text-sm lg:h-64">
            {lines.map((entry) => (
              <p key={entry.key} className="m-0 mb-1">{entry.line}</p>
            ))}
          </div>
        </section>
        <div className="order-3 text-center">
          <LeaveButton onLeave={() => client.leave()} />
        </div>
      </aside>
    </section>
  );
}
