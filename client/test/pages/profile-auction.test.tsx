import type { AuctionHistoryEntry } from "@pokemon-minigames/shared";
import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { NO_STATS, type FakeServices, fakeServices, renderWithServices } from "../helpers/services";

/** #40: la subasta en el perfil. */
const AUCTION = { played: 3, wins: 2, losses: 1, winRate: 2 / 3 };
const game = (over: Partial<AuctionHistoryEntry> = {}): AuctionHistoryEntry => ({
  id: "a1",
  endedAt: "2026-11-14T12:00:00.000Z",
  result: "won",
  reason: "completed",
  opponent: { username: "misty", avatarId: null },
  team: [6, 9, 3, 25, 143, 445],
  ...over,
});

function renderAt(route: string, services: FakeServices) {
  return renderWithServices(
    <Routes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/jugador/:username" element={<ProfilePage />} />
    </Routes>,
    { services, route },
  );
}

describe("la subasta en el perfil", () => {
  it("el resumen: partidas, victorias, derrotas y porcentaje, aunque no haya jugado a Doble tipo", async () => {
    const services = fakeServices();
    services.endpoints.stats.mine = vi.fn(async () => ({ username: "ash", avatarId: null, stats: NO_STATS, auction: AUCTION }));
    renderAt("/perfil", services);
    const block = await screen.findByRole("region", { name: "Subasta Pokémon" });
    const value = (label: string) => within(block).getByText(label).nextElementSibling;
    expect(value("Partidas")).toHaveTextContent("3");
    expect(value("Victorias")).toHaveTextContent("2");
    expect(value("Derrotas")).toHaveTextContent("1");
    expect(value("Porcentaje")).toHaveTextContent("67 %");
  });

  it("sin subastas lo dice, en la persona que toca", async () => {
    const services = fakeServices();
    renderAt("/jugador/misty", services);
    expect(await within(await screen.findByRole("region", { name: "Subasta Pokémon" })).findByText("Aún no ha jugado a la subasta.")).toBeInTheDocument();
  });

  it("mis últimas subastas: el rival, el resultado, el motivo, la fecha y mi equipo", async () => {
    const services = fakeServices();
    services.endpoints.stats.auctionHistory = vi.fn(async () => ({ games: [game(), game({ id: "a2", result: "lost", reason: "forfeit" })] }));
    renderAt("/perfil", services);
    const list = await screen.findByRole("list", { name: "Tus últimas subastas" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link", { name: "misty" })).toHaveAttribute("href", "/jugador/misty");
    expect(rows[0]).toHaveTextContent("Ganaste");
    expect(rows[1]).toHaveTextContent("Perdiste");
    expect(rows[1]).toHaveTextContent("Abandonaste la partida");
    expect(rows[0]!.querySelector("time")).toHaveAttribute("dateTime", "2026-11-14T12:00:00.000Z");
    expect(rows[0]!.querySelectorAll("img[data-team-member]")).toHaveLength(6);
  });

  it("sin subastas propias lo dice; en un perfil ajeno no se piden", async () => {
    const services = fakeServices();
    renderAt("/perfil", services);
    expect(await screen.findByText("Aún no has jugado a la subasta.")).toBeInTheDocument();
    const other = fakeServices();
    renderAt("/jugador/misty", other);
    await screen.findAllByRole("region", { name: "Subasta Pokémon" });
    expect(other.endpoints.stats.auctionHistory).not.toHaveBeenCalled();
  });
});
