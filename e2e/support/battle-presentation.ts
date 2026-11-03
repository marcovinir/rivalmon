import type { Page } from "@playwright/test";
import type { BattleAction, BattleFighterView, BattleView, RoomStateView, ServerEvent } from "@pokemon-minigames/shared";

const fighter = (id: number, name: string): BattleFighterView => ({
  pokemon: { id, names: { es: name, en: name }, spriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`, types: ["normal"], stats: { hp: 100, attack: 60, defense: 60, spAttack: 60, spDefense: 60, speed: 60 }, totalStats: 400 },
  hp: 100, maxHp: 100, ability: null, status: null, stages: {},
});

export function presentationBattle(over: Partial<BattleView> = {}): BattleView {
  return { round: 1, turn: 1, scene: "bosque", deadline: null, choosing: true, stepId: 1, warningUntil: null, rivalIdle: false, confirmed: false, myLineup: null, myMove: null, mySwitch: null, myPause: null,
    myTeam: [fighter(1, "Bulbasaur"), fighter(25, "Pikachu"), fighter(7, "Squirtle"), fighter(4, "Charmander"), fighter(39, "Jigglypuff"), fighter(52, "Meowth")], rivalTeam: [fighter(6, "Charizard")], myTitular: 1, rivalTitular: 6,
    moves: ["Placaje", "Hoja Afilada", "Recuperación", "Desarrollo"].map((name, index) => ({ move: `move-${index}`, name, type: "normal", category: "physical", power: 40, accuracy: 100, pp: 10, maxPp: 35, effectiveness: 1, effect: null })), ...over };
}

export const presentationHit = (over: Partial<BattleAction> = {}): BattleAction => ({ actor: 1, move: "tackle", moveName: "Placaje", damage: 30, critical: false, effectiveness: 1, healed: 0, actorHp: 100, targetHp: 70, missed: false, blocked: null, notes: [], ...over });

/** Presentación determinista sobre el cliente y CSS de producción; no sustituye la E2E del motor real.
 * Se simula el transporte polling de Socket.io para entregar resultados públicos en un orden conocido. */
export async function battlePresentation(page: Page) {
  let battle = presentationBattle();
  let generation = 0;
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  const send = (event: ServerEvent) => { queue.push(`42${JSON.stringify([event.name, event.payload])}`); wake?.(); };
  const room = (): RoomStateView => ({ code: "ABC234", serverNow: Date.now(), phase: "battle", config: { game: "subasta", traps: false }, mySeat: 1,
    players: [{ seat: 1, username: "a".repeat(30), connected: true, totalStats: 0, teamSize: 2 }, { seat: 2, username: "b".repeat(30), connected: true, totalStats: 0, teamSize: 1 }],
    myTeam: [], opponentTeam: [], roundsPlayed: 0, startsAt: null, opponentGraceEndsAt: null, round: null,
    auction: { money: { 1: 0, 2: 0 }, teamSizes: { 1: 2, 2: 1 }, purchases: { 1: [], 2: [] }, lot: null, reveal: [], battle } });
  await page.route("**/socket.io/**", async (route) => {
    const request = route.request();
    const sid = new URL(request.url()).searchParams.get("sid");
    let body = "ok";
    if (request.method() === "POST") {
      for (const packet of (request.postData() ?? "").split("\x1e")) {
        if (packet.startsWith("40")) { queue.push(`40${JSON.stringify({ sid: "presentation" })}`); wake?.(); }
        if (packet.startsWith("42")) {
          const [name] = JSON.parse(packet.slice(2)) as [string];
          if (name === "join-room") send({ name: "room-state", payload: room() });
        }
      }
    } else if (!sid) {
      generation++;
      wake?.();
      body = `0${JSON.stringify({ sid: `presentation-${generation}`, upgrades: [], pingInterval: 60_000, pingTimeout: 60_000, maxPayload: 1_000_000 })}`;
    } else {
      if (queue.length === 0) await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500);
        wake = () => { clearTimeout(timer); resolve(); };
      });
      body = sid === `presentation-${generation}` && queue.length > 0 ? queue.splice(0).join("\x1e") : "2";
    }
    // Una recarga puede cancelar el polling anterior mientras se prepara el room-state siguiente.
    await route.fulfill({ status: 200, contentType: "text/plain; charset=UTF-8", body }).catch(() => undefined);
  });
  return {
    state(next: BattleView) { battle = next; send({ name: "room-state", payload: room() }); },
    resolve(payload: Extract<ServerEvent, { name: "battle-turn" }>["payload"], final: BattleView) { send({ name: "battle-turn", payload }); battle = final; send({ name: "room-state", payload: room() }); },
    send,
  };
}
