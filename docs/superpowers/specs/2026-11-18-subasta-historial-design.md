# Subasta Pokémon: historial y estadísticas en el perfil (#40)

Lo que se muestra lo aprobó Marco el 2026-11-14: un resumen con partidas, victorias y porcentaje, y las últimas 10 partidas con el rival, el resultado, la fecha y los 6 sprites de tu equipo. Las partidas con invitados no se guardan y Doble tipo no cambia. El resto son decisiones del agente, marcadas así, que Marco revisa con esta spec.

## Intención

Que jugar a la subasta deje rastro en el perfil, como Doble tipo: cuántas jugaste y ganaste, y tus últimas partidas con el equipo que compraste.

## Lo que se ve

- **En el perfil (el propio y el ajeno)**, un bloque «Subasta Pokémon» con partidas, victorias, derrotas y porcentaje de victorias, igual que las fichas de Doble tipo. Con 0 partidas dice «Aún no has jugado a la subasta».
- **En el perfil propio**, «Tus últimas subastas»: hasta 10 filas, la más reciente primero. Cada fila lleva:
  - el rival, con su avatar de hoy;
  - «Ganaste» o «Perdiste», más el motivo si no fue un final normal («abandono» o «desconexión»);
  - la fecha;
  - los 6 sprites de tu equipo, en orden de compra.
  - Sin paginación (del agente): 10 bastan para empezar.
- El historial de Doble tipo y sus estadísticas siguen exactamente igual.

## Qué se guarda (migración nueva, solo aditiva)

Dos tablas nuevas; no se toca ninguna existente.

- `auction_games`: `id`, `room_code`, `end_reason` (el enum `GameEndReason` que ya existe), `winner_id` (nulo si no hubo ganador), `created_at` y `ended_at`.
- `auction_game_players`: `game_id`, `user_id`, `seat`, `team` (los 6 números de Pokédex, `smallint[]`, en orden de compra), `spent` (lo que gastó) y `damage` (el daño que hizo). Llave `(game_id, seat)`, única `(game_id, user_id)` e índice por `user_id`.
- **Del agente:** se guarda `spent` y `damage` aunque hoy no se muestren, porque el resumen de la partida ya los calcula y así un futuro «mejor partida» no necesita otra migración.

## Cuándo se guarda (del agente)

- Una sola escritura, al terminar la partida, si terminó como partida jugada: `completed`, `forfeit` o `disconnect`. Lo que se cancela o caduca antes de empezar no deja filas.
- Solo si **los dos asientos son cuentas**: con un invitado no se escribe nada, como en Doble tipo.
- Si la escritura falla, la partida sigue igual para los jugadores y se anota el error en el registro del servidor; no se reintenta.
- La revancha es otra partida y otra fila.
- **Al borrar una cuenta** sus filas se quedan: la cuenta ya se anonimiza (`borrada-…@invalid`) y el rival conserva su historial, como en Doble tipo.

## La API (del agente)

- `GET /stats` y `GET /users/:username/stats` añaden `auction: { played, wins, losses, winRate }`. Solo se añade un campo; lo que ya devolvían no cambia.
- `GET /stats/auction/history` (solo para cuentas) devuelve las 10 últimas: `{ games: [{ id, endedAt, result, reason, opponent: { username, avatarId }, team: number[] }] }`.

## No objetivos

- La silueta sigue sin guardar partidas.
- No hay estadísticas por Pokémon ni récord contra un rival en la subasta.
- No se cambian las estadísticas ni el historial de Doble tipo.

## Plan

1. **Migración y modelo:** `auction_games` y `auction_game_players` en `schema.prisma`, con una migración nueva. Se prueba que se aplica sobre una base vacía y que las tablas viejas no cambian.
2. **Guardar al terminar:** un puerto `AuctionRecordRepository.save(record)` y su versión con Prisma. La sala de la subasta lo llama con el resultado de `game-ended` cuando los dos son cuentas. Pruebas:
   - con invitado no se guarda;
   - el abandono y la desconexión se guardan con su motivo;
   - lo cancelado no se guarda;
   - si falla la escritura, la sala sigue;
   - borrar la cuenta conserva las filas del rival.
3. **Leer:** `StatsService` calcula `auction` (partidas, victorias, derrotas y porcentaje) y la lista de las últimas 10. Pruebas: cuentas exactas, el orden, el límite de 10, que Doble tipo no cambia y que solo se ven las propias.
4. **Rutas:** el campo `auction` en `/stats` y en `/users/:username/stats`, y `GET /stats/auction/history`. Pruebas de las rutas y de acceso: sin sesión 401, y un invitado 403.
5. **Cliente:** el bloque «Subasta Pokémon» en `StatsView` y «Tus últimas subastas» en el perfil propio. Pruebas con Testing Library. Se mira en navegador real a 360 y 375 px y en escritorio, y se pasa la auditoría de contraste.
6. **E2E y documentación:** una partida de subasta entre dos cuentas aparece en los dos perfiles, y con un invitado no aparece. Se actualizan `docs/guia-tecnica.md` (tablas, rutas) y los dos README.

**Fusionar pide permiso expreso de Marco**, porque lleva una migración (aditiva: solo crea dos tablas).
