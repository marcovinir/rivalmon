import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAuctionHistory } from "../../src/game/prisma-auction-history.js";
import { prisma, resetDatabase } from "../helpers/db.js";

/** #40: guardar y leer el historial de la subasta en la base de datos. */
const history = new PrismaAuctionHistory(prisma);

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function user(username: string, avatarPokemonId: number | null = null): Promise<string> {
  const created = await prisma.user.create({ data: { email: `${username}@example.com`, username, passwordHash: "x", avatarPokemonId } });
  return created.id;
}

/** Una partida entre `a` (asiento 1) y `b` (asiento 2). */
const game = (a: string, b: string, winner: string | null, reason: "completed" | "forfeit" | "disconnect" = "completed", room = "SUB234") => ({
  roomCode: room,
  reason,
  winnerUserId: winner,
  players: [
    { userId: a, seat: 1 as const, team: [6, 9, 3, 25, 143, 445], spent: 900_000, damage: 410 },
    { userId: b, seat: 2 as const, team: [150, 151, 249, 250, 384, 493], spent: 1_200_000, damage: 380 },
  ],
});

describe("el historial de la subasta", () => {
  it("guarda la partida con el equipo, lo gastado y el daño de cada uno", async () => {
    const [ash, misty] = [await user("ash"), await user("misty")];
    await history.save(game(ash, misty, ash));
    const saved = await prisma.auctionGame.findFirstOrThrow({ include: { players: { orderBy: { seat: "asc" } } } });
    expect(saved).toMatchObject({ roomCode: "SUB234", endReason: "completed", winnerId: ash });
    expect(saved.players[0]).toMatchObject({ userId: ash, team: [6, 9, 3, 25, 143, 445], spent: 900_000, damage: 410 });
  });

  it("cuenta partidas, victorias, derrotas y porcentaje de cada uno", async () => {
    const [ash, misty] = [await user("ash"), await user("misty")];
    await history.save(game(ash, misty, ash));
    await history.save(game(ash, misty, ash, "forfeit"));
    await history.save(game(misty, ash, misty));
    expect(await history.stats(ash)).toEqual({ played: 3, wins: 2, losses: 1, winRate: 2 / 3 });
    expect(await history.stats(misty)).toEqual({ played: 3, wins: 1, losses: 2, winRate: 1 / 3 });
    expect(await history.stats(await user("brock"))).toEqual({ played: 0, wins: 0, losses: 0, winRate: null });
  });

  it("las últimas, la más reciente primero, como mucho las pedidas, con el rival y mi equipo", async () => {
    const [ash, misty] = [await user("ash"), await user("misty", 25)];
    for (let i = 0; i < 12; i++) await history.save(game(ash, misty, i % 2 ? misty : ash, i === 11 ? "disconnect" : "completed", `R${i}`));
    const recent = await history.recent(ash, 10);
    expect(recent).toHaveLength(10);
    expect(recent[0]).toMatchObject({ result: "lost", reason: "disconnect", opponent: { username: "misty", avatarId: 25 }, team: [6, 9, 3, 25, 143, 445] });
    expect(recent[1]).toMatchObject({ result: "won", reason: "completed" });
    expect(new Date(recent[0]!.endedAt).getTime()).toBeGreaterThanOrEqual(new Date(recent[9]!.endedAt).getTime());
    // Desde el otro asiento, su propio equipo.
    expect((await history.recent(misty, 1))[0]).toMatchObject({ result: "won", team: [150, 151, 249, 250, 384, 493], opponent: { username: "ash" } });
  });

  it("las partidas de Doble tipo no cuentan", async () => {
    const ash = await user("ash");
    await prisma.game.create({ data: { roomCode: "DOB234", typeMode: "random", lengthMode: "custom", roundsLimit: 3, status: "completed", endReason: "completed", winnerId: ash, endedAt: new Date(), players: { create: [{ userId: ash, seat: 1 }] } } });
    expect(await history.stats(ash)).toMatchObject({ played: 0 });
  });
});
