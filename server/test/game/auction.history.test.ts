import { readFileSync } from "node:fs";
import type { RoomConfig } from "@pokemon-minigames/shared";
import { describe, expect, it, vi } from "vitest";
import { PokemonCatalog } from "../../src/catalog/pokemon-catalog.js";
import type { CatalogSnapshot } from "../../src/catalog/snapshot.js";
import { totalStats } from "../../src/catalog/snapshot.js";
import type { AuctionGameInput } from "../../src/game/ports.js";
import { GameRoom } from "../../src/game/room.js";
import { fixtureCatalog } from "../helpers/fixtures.js";
import { sequenceRng } from "../helpers/rng.js";
import { AUCTION, AuctionHarness } from "./auction-harness.js";
import { FakeRepository, FakeTime, RecordingBroadcaster } from "./fakes.js";

/** #40: una partida de subasta jugada entre dos cuentas se guarda una vez, al terminar. */
const snapshot = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8")) as CatalogSnapshot;
const catalog = new PokemonCatalog(snapshot.pokemon.map((one) => ({ ...one, totalStats: totalStats(one.stats) })));

describe("el motor avisa de que hay que guardar", () => {
  it("al abandonar en plena partida, con el motivo, el ganador y lo de cada uno", () => {
    const h = new AuctionHarness({ seed: 1, catalog, config: AUCTION });
    h.startGame();
    h.noBids();
    const effects = h.dispatch({ type: "LEAVE", seat: 1 });
    const persisted = effects.filter((one) => one.kind === "persist_auction");
    expect(persisted).toEqual([{ kind: "persist_auction", record: { reason: "forfeit", winnerSeat: 2, players: { 1: { team: [...h.state.teams[1]], spent: h.state.spent[1], damage: 0 }, 2: { team: [...h.state.teams[2]], spent: h.state.spent[2], damage: 0 } } } }]);
  });

  it("una partida que no llegó a empezar no se guarda", () => {
    const h = new AuctionHarness({ seed: 1, catalog, config: AUCTION });
    const effects = h.dispatch({ type: "LEAVE", seat: 1 });
    expect(effects.some((one) => one.kind === "persist_auction")).toBe(false);
  });
});

const SUBASTA: RoomConfig = { game: "subasta", traps: false };

function room(opts: { guest?: boolean; save?: (input: AuctionGameInput) => Promise<void> } = {}) {
  const time = new FakeTime();
  const saved: AuctionGameInput[] = [];
  const logger = { error: vi.fn() };
  const instance = GameRoom.create(
    {
      clock: time,
      scheduler: time,
      broadcaster: new RecordingBroadcaster(),
      repository: new FakeRepository(),
      auctionHistory: { save: opts.save ?? (async (input) => void saved.push(input)) },
      catalog: fixtureCatalog(),
      rng: sequenceRng([0]),
      logger,
      persistAttempts: 1,
      persistRetryDelayMs: 0,
    },
    { code: "SUB234", gameId: null, config: SUBASTA, creator: { userId: "u1", username: "ash", isGuest: false, avatarId: null } },
  );
  instance.dispatch({ type: "PLAYER_JOINED", userId: "u2", username: "misty", guest: opts.guest });
  instance.dispatch({ type: "PLAYER_CONNECTED", seat: 1 });
  instance.dispatch({ type: "PLAYER_CONNECTED", seat: 2 });
  time.advance(5000);
  expect(instance.view(1).phase).toBe("auction");
  return { room: instance, saved, logger, time };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("la sala la guarda", () => {
  it("entre dos cuentas, con quién ganó y en qué asiento estaba cada uno", async () => {
    const { room: r, saved, time } = room();
    r.dispatch({ type: "LEAVE", seat: 1 });
    await settle();
    expect(saved).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), endedAt: new Date(time.now()), roomCode: "SUB234", reason: "forfeit", winnerUserId: "u2", players: [expect.objectContaining({ userId: "u1", seat: 1 }), expect.objectContaining({ userId: "u2", seat: 2 })] }]);
  });

  it("también la desconexión, con su motivo", async () => {
    const { room: r, saved, time } = room();
    r.dispatch({ type: "PLAYER_DISCONNECTED", seat: 1 });
    time.advance(60_000);
    await settle();
    expect(saved).toEqual([expect.objectContaining({ reason: "disconnect", winnerUserId: "u2" })]);
  });

  it("con un invitado no se guarda nada", async () => {
    const { room: r, saved } = room({ guest: true });
    r.dispatch({ type: "LEAVE", seat: 1 });
    await settle();
    expect(saved).toEqual([]);
  });

  it("si falla la escritura, la partida termina igual y se anota", async () => {
    const { room: r, logger } = room({ save: () => Promise.reject(new Error("caída")) });
    r.dispatch({ type: "LEAVE", seat: 1 });
    await settle();
    await settle();
    expect(r.view(1).phase).toBe("finished");
    expect(logger.error).toHaveBeenCalled();
  });
});
