import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAuctionHistory } from "../../src/game/prisma-auction-history.js";
import { buildTestContext } from "../helpers/app.js";
import { prisma, resetDatabase } from "../helpers/db.js";
import { type TestUser, enterAsGuest, registerUser } from "../helpers/users.js";

/** #40: el resumen y las últimas subastas, en las rutas de estadísticas. */
let ctx = buildTestContext();
let ash: TestUser;
let misty: TestUser;
const history = new PrismaAuctionHistory(prisma);

beforeEach(async () => {
  await resetDatabase();
  ctx = buildTestContext();
  ash = await registerUser(ctx.app, "ash");
  misty = await registerUser(ctx.app, "misty");
});
afterAll(() => prisma.$disconnect());

const get = (path: string, user: TestUser = ash) => request(ctx.app).get(path).set({ Authorization: `Bearer ${user.token}` });
const play = (winner: TestUser) =>
  history.save({
    roomCode: "SUB234",
    reason: "completed",
    winnerUserId: winner.userId,
    players: [
      { userId: ash.userId, seat: 1, team: [1, 2, 3, 4, 5, 6], spent: 100, damage: 10 },
      { userId: misty.userId, seat: 2, team: [7, 8, 9, 10, 11, 12], spent: 200, damage: 20 },
    ],
  });

describe("las estadísticas de la subasta", () => {
  it("/stats y el perfil ajeno traen el resumen; lo de Doble tipo no cambia", async () => {
    await play(ash);
    await play(misty);
    await play(ash);
    const mine = await get("/stats");
    expect(mine.status).toBe(200);
    expect(mine.body.auction).toEqual({ played: 3, wins: 2, losses: 1, winRate: 2 / 3 });
    expect(mine.body.stats.played).toBe(0);
    expect((await get("/users/misty/stats")).body.auction).toEqual({ played: 3, wins: 1, losses: 2, winRate: 1 / 3 });
  });

  it("las últimas subastas son solo mías, con mi equipo", async () => {
    await play(ash);
    const response = await get("/stats/auction/history");
    expect(response.status).toBe(200);
    expect(response.body.games).toEqual([expect.objectContaining({ result: "won", team: [1, 2, 3, 4, 5, 6], opponent: { username: "misty", avatarId: null } })]);
    expect((await get("/stats/auction/history", misty)).body.games[0]).toMatchObject({ result: "lost", team: [7, 8, 9, 10, 11, 12] });
  });

  it("sin sesión 401; un invitado 403", async () => {
    expect((await request(ctx.app).get("/stats/auction/history")).status).toBe(401);
    const guest = await enterAsGuest(ctx.app, "gary");
    expect((await get("/stats/auction/history", guest)).status).toBe(403);
  });
});
