import type { BaseStats, BattleFighterView } from "@pokemon-minigames/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Timer } from "../../../components/Timer";
import { TypeChip } from "../../../components/TypeChip";
import { spriteUrl } from "../../../catalog/artwork";
import { BATTLE_LINEUP_MS } from "../../../game/durations";
import { AUCTION_TEXT, BATTLE_TEXT, STAT_LABELS } from "../../../i18n/es";
import { TYPE_STYLES } from "../../../theme/type-styles";
import { LeaveButton } from "../LeaveButton";
import { useRoom } from "../use-room";

const STATS: (keyof BaseStats)[] = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];
/** Las barras llegan al tope en 180: casi ningún Pokémon pasa de ahí en una stat. */
const STAT_TOP = 180;
/** El borrador sale cuando se deja de tocar: tocar seguido mandaría un mensaje por toque y chocaría con el límite del servidor. */
const DRAFT_DELAY_MS = 400;

/**
 * Elegir el orden (#56): se toca a cada Pokémon en el orden en que debe salir y recibe su número; tocarlo otra vez lo quita.
 * Cada toque guarda un borrador privado: sobrevive a recargar y, si se acaba el tiempo, los numerados salen primero.
 * Del rival se ve quién está, con sus PS y tipos, pero no su orden ni sus ataques.
 */
export function LineupView() {
  const { view, client } = useRoom();
  const battle = view.auction?.battle;
  const [order, setOrder] = useState<number[]>(() => (battle?.confirmed ? battle.myLineup : battle?.myLineupDraft) ?? []);
  const [last, setLast] = useState<{ id: number; position: number | null } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
  };
  useEffect(() => cancelDraft, []);
  if (!battle) return null;

  const confirmed = battle.confirmed;
  const shown = confirmed && battle.myLineup ? battle.myLineup : order;
  const total = battle.myTeam.length;
  const nameOf = (id: number) => battle.myTeam.find((one) => one.pokemon.id === id)?.pokemon.names.es ?? "";
  const toggle = (id: number) => {
    const next = order.includes(id) ? order.filter((one) => one !== id) : [...order, id];
    setOrder(next);
    setLast({ id, position: next.includes(id) ? next.indexOf(id) + 1 : null });
    cancelDraft();
    draftTimer.current = setTimeout(() => client.lineup(next, true), DRAFT_DELAY_MS);
  };
  const confirm = () => {
    // Confirmar ya manda el orden entero: el borrador pendiente sobra.
    cancelDraft();
    client.lineup(order);
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <Card tone="raised" className="flex flex-col items-center gap-2 p-4 text-center">
        <h1 className="font-pixel text-3xl font-bold">{BATTLE_TEXT.lineupTitle}</h1>
        <p className="m-0 text-sm text-muted">{BATTLE_TEXT.lineupHint}</p>
        <Timer deadline={battle.deadline} offset={view.clockOffset} totalMs={BATTLE_LINEUP_MS} label={BATTLE_TEXT.lineupTimer} />
      </Card>
      <p role="status" className="sr-only">
        {last ? (last.position === null ? BATTLE_TEXT.lineupCleared(nameOf(last.id)) : BATTLE_TEXT.lineupNumbered(nameOf(last.id), last.position)) : ""}
      </p>
      <ul aria-label={BATTLE_TEXT.yourLineup} className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {battle.myTeam.map((one) => {
          const position = shown.indexOf(one.pokemon.id) + 1;
          return (
            <li key={one.pokemon.id} className="min-w-0">
              <MyCard fighter={one} position={position} disabled={confirmed} onToggle={() => toggle(one.pokemon.id)} />
            </li>
          );
        })}
      </ul>
      <div className="lineup-confirm">
        <Button variant="primary" size="lg" className="w-full" disabled={confirmed || shown.length !== total} onClick={confirm}>
          {confirmed ? AUCTION_TEXT.waitingRival : BATTLE_TEXT.confirmOrder(shown.length, total)}
        </Button>
      </div>
      <div>
        <h2 className="mb-2 font-display text-lg font-semibold">{BATTLE_TEXT.rivalTeam}</h2>
        <ul aria-label={BATTLE_TEXT.rivalTeam} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {battle.rivalTeam.map((one) => (
            <li key={one.pokemon.id} className="framed flex min-w-0 flex-col items-center gap-1 rounded-card bg-surface p-2 text-center">
              <img src={spriteUrl(one.pokemon.id)} alt="" className="size-14 [image-rendering:pixelated]" />
              <span className="w-full font-display text-sm font-semibold [overflow-wrap:anywhere]">{one.pokemon.names.es}</span>
              <span className="font-num text-xs font-bold">{BATTLE_TEXT.hpShort(one.maxHp)}</span>
              <span className="flex flex-wrap justify-center gap-1">
                {one.pokemon.types.map((type) => <TypeChip key={type} type={type} size="sm" />)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="text-center">
        <LeaveButton onLeave={() => client.leave()} />
      </div>
    </section>
  );
}

/** Un Pokémon mío: todo lo que hace falta para decidir su puesto, y el número que lleva. */
function MyCard({ fighter, position, disabled, onToggle }: { fighter: BattleFighterView; position: number; disabled: boolean; onToggle(): void }) {
  const name = fighter.pokemon.names.es;
  const label = position === 0 ? BATTLE_TEXT.lineupNoNumber(name) : BATTLE_TEXT.lineupNumber(name, position);
  const detailsId = `lineup-${fighter.pokemon.id}`;
  return (
    <button type="button" className="lineup-card" aria-pressed={position > 0} aria-label={label} aria-describedby={detailsId} disabled={disabled} onClick={onToggle}>
      <span aria-hidden="true" className="lineup-number">{position || ""}</span>
      <img src={spriteUrl(fighter.pokemon.id)} alt="" className="size-16 flex-none [image-rendering:pixelated]" />
      <span id={detailsId} className="flex min-w-0 flex-1 flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-display text-base font-semibold [overflow-wrap:anywhere]">{name}</span>
          {position === 1 ? <span className="lineup-titular">{BATTLE_TEXT.titular}</span> : null}
          {fighter.pokemon.types.map((type) => <TypeChip key={type} type={type} size="sm" />)}
        </span>
        {fighter.ability ? <span className="text-xs font-bold">{fighter.ability.name}</span> : null}
        <span className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">
          {(fighter.moves ?? []).map((move) => (
            <span key={move.move} className="flex min-w-0 items-center gap-1">
              <span aria-hidden="true" className="size-2 flex-none rounded-full" style={move.type ? { background: TYPE_STYLES[move.type].background } : undefined} />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{move.name}</span>
              <span className="flex-none font-num font-bold">{BATTLE_TEXT.ppOf(move.pp, move.maxPp)}</span>
            </span>
          ))}
        </span>
        <span className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[0.6875rem] leading-tight">
          {STATS.map((stat) => (
            <span key={stat} className="min-w-0">
              <span className="flex justify-between gap-1">
                <span className="truncate">{STAT_LABELS[stat]}</span>
                <span className="font-num font-bold">{fighter.pokemon.stats[stat]}</span>
              </span>
              <span aria-hidden="true" className="lineup-stat">
                <span style={{ width: `${Math.min(100, (fighter.pokemon.stats[stat] / STAT_TOP) * 100)}%` }} />
              </span>
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}
