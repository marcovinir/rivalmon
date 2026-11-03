import type { BattleView, Seat } from "@pokemon-minigames/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleLogEntry } from "../../../game/apply-event";
import { buildBattleFrames } from "../../../game/battle-playback";

/** Solo un evento nuevo inicia la reproducción: montar con un registro previo no repite golpes. */
export function useBattlePlayback(entry: BattleLogEntry | null, authoritative: BattleView | undefined, mySeat: Seat) {
  const seen = useRef(entry);
  const frames = useMemo(() => entry?.before ? buildBattleFrames(entry.before, entry, mySeat) : [], [entry, mySeat]);
  const [playing, setPlaying] = useState<{ entry: BattleLogEntry; index: number } | null>(null);
  useEffect(() => {
    if (seen.current === entry) return;
    seen.current = entry;
    if (!entry || frames.length === 0) {
      setPlaying(null);
      return;
    }
    setPlaying({ entry, index: 0 });
    let elapsed = 0;
    const timers = frames.map((frame, index) => {
      elapsed += frame.step.durationMs;
      return setTimeout(() => setPlaying(index + 1 < frames.length ? { entry, index: index + 1 } : null), elapsed);
    });
    return () => timers.forEach(clearTimeout);
  }, [entry, frames]);

  // El primer cuadro se deriva ya durante el render: ni un solo pintado debe adelantar los PS finales.
  const index = entry && entry !== seen.current ? 0 : playing?.entry === entry ? playing.index : null;
  const frame = index === null ? null : frames[index] ?? null;
  const final = frame?.step.kind === "complete";
  const presented = final && authoritative !== entry?.before ? authoritative : frame?.battle;
  return {
    battle: frame && presented ? { ...presented, choosing: false, moves: [], warningUntil: null } : authoritative,
    frame,
    index,
    busy: frame !== null && !final,
  };
}
