import type { AuctionHistoryEntry, AuctionStats } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../db/prisma.js";
import type { AuctionGameInput, AuctionHistoryRepository } from "./ports.js";

/** El historial de Subasta Pokémon (#40) en sus dos tablas propias: no toca las de Doble tipo. */
export class PrismaAuctionHistory implements AuctionHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Una sola escritura por partida, con sus dos jugadores, al terminar. */
  async save(input: AuctionGameInput): Promise<void> {
    await this.prisma.auctionGame.create({
      data: {
        roomCode: input.roomCode,
        endReason: input.reason,
        winnerId: input.winnerUserId,
        endedAt: new Date(),
        players: { create: input.players.map(({ userId, seat, team, spent, damage }) => ({ userId, seat, team, spent, damage })) },
      },
    });
  }

  async stats(userId: string): Promise<AuctionStats> {
    const [played, wins] = await Promise.all([
      this.prisma.auctionGamePlayer.count({ where: { userId } }),
      this.prisma.auctionGame.count({ where: { winnerId: userId, players: { some: { userId } } } }),
    ]);
    // Sin ganador (hoy no ocurre) no es victoria ni derrota.
    const drawn = await this.prisma.auctionGame.count({ where: { winnerId: null, players: { some: { userId } } } });
    return { played, wins, losses: played - wins - drawn, winRate: played === 0 ? null : wins / played };
  }

  /** Las últimas `limit`, la más reciente primero, con mi equipo y el rival con su avatar de hoy. */
  async recent(userId: string, limit: number): Promise<AuctionHistoryEntry[]> {
    const games = await this.prisma.auctionGame.findMany({
      where: { players: { some: { userId } } },
      orderBy: [{ endedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { players: { include: { user: { select: { username: true, avatarPokemonId: true } } } } },
    });
    return games.map((game) => {
      const mine = game.players.find((player) => player.userId === userId)!;
      const rival = game.players.find((player) => player.userId !== userId)!;
      return {
        id: game.id,
        endedAt: game.endedAt.toISOString(),
        result: game.winnerId === null ? "drawn" : game.winnerId === userId ? "won" : "lost",
        reason: game.endReason,
        opponent: { username: rival.user.username, avatarId: rival.user.avatarPokemonId },
        team: mine.team,
      };
    });
  }
}
