import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { battleState, fighter, moveView } from "../helpers/battle";
import { renderRoom } from "../helpers/room";
import { fakeServices } from "../helpers/services";

/** #56: cada Pokémon con sus datos, y el orden se elige numerándolos al tocarlos. */
const withMoves = (id: number, name: string) =>
  fighter(id, name, 100, 120, {
    ability: { id: "blaze", name: "Mar Llamas", description: "Potencia el Fuego con pocos PS.", active: true },
    moves: [moveView({ move: "flamethrower", name: "Lanzallamas", type: "fire", pp: 15, maxPp: 15 }), moveView({ move: "tackle", name: "Placaje", pp: 35, maxPp: 35 })],
  });
const MINE = [withMoves(1, "Uno"), withMoves(2, "Dos"), withMoves(3, "Tres")];
const lineup = (over = {}) => battleState("lineup", { round: 0, turn: 0, myTitular: null, rivalTitular: null, moves: [], myTeam: MINE, ...over });
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("la alineación con datos", () => {
  it("cada Pokémon mío enseña imagen, tipos, habilidad, ataques con PP y estadísticas", () => {
    renderRoom([lineup()]);
    const uno = card("Uno");
    expect(uno.querySelector("img")).not.toBeNull();
    expect(uno).toHaveTextContent(/fuego/i);
    expect(uno).toHaveTextContent("Mar Llamas");
    expect(uno).toHaveTextContent("LanzallamasPP 15/15");
    expect(uno).toHaveTextContent("PlacajePP 35/35");
    expect(uno).toHaveTextContent("Velocidad");
  });

  it("del rival, solo imagen, nombre, PS y tipos", () => {
    renderRoom([lineup({ rivalTeam: [fighter(4, "Cuatro", 90, 90)] })]);
    const rival = screen.getByRole("list", { name: "Equipo rival" });
    expect(within(rival).getByText("Cuatro")).toBeInTheDocument();
    expect(rival).toHaveTextContent("PS 90");
    expect(rival).toHaveTextContent(/volador/i);
    expect(rival).not.toHaveTextContent("Placaje");
  });

  it("tocar da el siguiente número y guarda el borrador; tocar otra vez lo quita y corre los demás", async () => {
    const services = fakeServices();
    const { user } = renderRoom([lineup()], services);
    await user.click(card("Dos"));
    await user.click(card("Uno"));
    expect(card("Dos")).toHaveAccessibleName(/^Dos, número 1, titular/);
    expect(card("Uno")).toHaveAccessibleName(/^Uno, número 2/);
    expect(card("Dos")).toHaveAttribute("aria-pressed", "true");
    expect(services.game.client.lineup).toHaveBeenLastCalledWith([2, 1], true);
    expect(screen.getByRole("status")).toHaveTextContent("Uno: número 2");
    await user.click(card("Dos"));
    expect(card("Uno")).toHaveAccessibleName(/^Uno, número 1, titular/);
    expect(card("Dos")).toHaveAccessibleName(/^Dos, sin número/);
    expect(services.game.client.lineup).toHaveBeenLastCalledWith([1], true);
    expect(screen.getByRole("status")).toHaveTextContent("Dos: sin número");
  });

  it("confirmar pide numerar a todos y envía el orden", async () => {
    const services = fakeServices();
    const { user } = renderRoom([lineup()], services);
    const confirm = screen.getByRole("button", { name: "Confirmar orden (0/3)" });
    expect(confirm).toBeDisabled();
    for (const name of ["Tres", "Uno", "Dos"]) await user.click(card(name));
    await user.click(screen.getByRole("button", { name: "Confirmar orden (3/3)" }));
    expect(services.game.client.lineup).toHaveBeenLastCalledWith([3, 1, 2]);
  });

  it("al recargar vuelven los números del borrador; ya confirmada, no se puede cambiar", () => {
    const { unmount } = renderRoom([lineup({ myLineupDraft: [3] })]);
    expect(card("Tres")).toHaveAccessibleName(/^Tres, número 1, titular/);
    unmount();
    renderRoom([lineup({ confirmed: true, myLineup: [2, 3, 1] })]);
    expect(card("Dos")).toHaveAccessibleName(/^Dos, número 1, titular/);
    expect(card("Dos")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Esperando al rival…" })).toBeDisabled();
  });

  it("el reloj cuenta 45 s", () => {
    renderRoom([lineup()]);
    expect(screen.getByRole("timer", { name: "Tiempo para elegir la alineación" })).toBeInTheDocument();
  });
});
