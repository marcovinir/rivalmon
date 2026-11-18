import type { AuctionHistoryEntry, AuctionStats } from "@pokemon-minigames/shared";
import type { PrismaClient } from "../db/prisma.js";
import type { AuctionGameInput, AuctionHistoryRepository } from "./ports.js";

/** Prisma avisa así de que la fila ya existe (aquí, la misma partida guardada antes). */
const isUniqueViolation = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

/** El historial de Subasta Pokémon (#40) en sus dos tablas propias: no toca las de Doble tipo. */
export class PrismaAuctionHistory implements AuctionHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Una sola escritura por partida, con sus dos jugadores, al terminar. Es idempotente: si se perdió la respuesta de una
   * escritura que sí llegó, el reintento trae el mismo `id` y no duplica la partida.
   */
  async save(input: AuctionGameInput): Promise<void> {
    try {
      await this.prisma.auctionGame.create({
        data: {
          id: input.id,
          roomCode: input.roomCode,
          endReason: input.reason,
          winnerId: input.winnerUserId,
          endedAt: input.endedAt,
          players: { create: input.players.map(({ userId, seat, team, spent, damage }) => ({ userId, seat, team, spent, damage })) },
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /** En una sola consulta: las tres cuentas salen de la misma foto aunque se guarde otra partida a la vez. */
  async stats(userId: string): Promise<AuctionStats> {
    const [row] = await this.prisma.$queryRaw<{ played: number; wins: number; drawn: number }[]>`
      SELECT count(*)::int AS played,
             count(*) FILTER (WHERE g.winner_id = p.user_id)::int AS wins,
             count(*) FILTER (WHERE g.winner_id IS NULL)::int AS drawn
      FROM auction_game_players p JOIN auction_games g ON g.id = p.game_id
      WHERE p.user_id = ${userId}::uuid`;
    const { played, wins, drawn } = row ?? { played: 0, wins: 0, drawn: 0 };
    // Sin ganador (hoy no ocurre) no es victoria ni derrota.
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
