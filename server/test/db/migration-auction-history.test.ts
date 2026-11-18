import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";

const migrationsDir = join(import.meta.dirname, "../../prisma/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_/.test(name))
  .sort();
const sqlOf = (name: string): string => readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");

/**
 * La migración del historial de la subasta (#40), sobre un esquema desechable como la de los códigos por correo: con una
 * cuenta y una partida de Doble tipo «de antes», solo añade sus dos tablas, vacías, y no toca nada de lo que había.
 */
describe("la migración del historial de la subasta", () => {
  const target = migrations.find((name) => name.endsWith("_auction_history"))!;
  const previous = migrations.slice(0, migrations.indexOf(target));

  it("es aditiva: lo que había sigue igual y las tablas nuevas nacen vacías", async () => {
    expect(target).toBeDefined();
    const sql = sqlOf(target);
    // Las cláusulas de las claves foráneas (ON DELETE …, ON UPDATE …) no son órdenes que cambien datos.
    expect(sql.replace(/ON (DELETE|UPDATE) (SET NULL|RESTRICT|CASCADE)/g, "")).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b|ALTER TABLE "(?!auction_)/i);
    const schema = `mig_${randomBytes(4).toString("hex")}`;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      for (const name of previous) await client.query(sqlOf(name));
      const user = await client.query("INSERT INTO users (id, email, username, password_hash) VALUES (gen_random_uuid(), 'antigua@example.com', 'antigua', 'hash') RETURNING id");
      await client.query("INSERT INTO games (id, room_code, type_mode, length_mode, rounds_limit, status, end_reason, winner_id, ended_at) VALUES (gen_random_uuid(), 'DOB234', 'random', 'custom', 3, 'completed', 'completed', $1, now())", [user.rows[0].id]);

      await client.query(sql);

      expect((await client.query("SELECT count(*)::int AS n FROM games")).rows[0].n).toBe(1);
      expect((await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n).toBe(1);
      expect((await client.query("SELECT count(*)::int AS n FROM auction_games")).rows[0].n).toBe(0);
      expect((await client.query("SELECT count(*)::int AS n FROM auction_game_players")).rows[0].n).toBe(0);
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
