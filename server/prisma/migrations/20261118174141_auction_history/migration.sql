-- Historial de Subasta Pokémon (#40): solo crea dos tablas nuevas; no toca ninguna existente.
-- Una fila por partida jugada entre dos cuentas, escrita una sola vez al terminar.

-- CreateTable
CREATE TABLE "auction_games" (
    "id" UUID NOT NULL,
    "room_code" VARCHAR(10) NOT NULL,
    "end_reason" "game_end_reason" NOT NULL,
    "winner_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auction_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_game_players" (
    "game_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat" SMALLINT NOT NULL,
    "team" SMALLINT[],
    "spent" INTEGER NOT NULL,
    "damage" INTEGER NOT NULL,

    CONSTRAINT "auction_game_players_pkey" PRIMARY KEY ("game_id","seat")
);

-- CreateIndex
CREATE INDEX "auction_game_players_user_id_idx" ON "auction_game_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_game_players_game_id_user_id_key" ON "auction_game_players"("game_id", "user_id");

-- AddForeignKey
ALTER TABLE "auction_games" ADD CONSTRAINT "auction_games_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_game_players" ADD CONSTRAINT "auction_game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "auction_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_game_players" ADD CONSTRAINT "auction_game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
