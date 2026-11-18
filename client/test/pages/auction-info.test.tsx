import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { battleState, fighter, moveView } from "../helpers/battle";
import { renderRoom, serverSends } from "../helpers/room";
import { fakeServices } from "../helpers/services";

/** #58: botones de ataque con su descripción, y fichas de cada Pokémon. */
const flamethrower = moveView({ move: "flamethrower", name: "Lanzallamas", type: "fire", category: "special", power: 90, description: "Ataca con una gran ráfaga de fuego.", effect: "Puede quemar (10 %)" });
const growl = moveView({ move: "growl", name: "Gruñido", category: "status", power: null, effectiveness: null, description: "Gruñe de forma tierna.", effect: "Baja el Ataque del rival" });
const ability = { id: "blaze", name: "Mar Llamas", description: "Potencia el Fuego con pocos PS.", active: true };
const mine = fighter(1, "Uno", 100, 100, { ability, moves: [flamethrower, { ...growl, pp: 30, maxPp: 40 }] });
const reserve = fighter(2, "Dos", 80, 100, { moves: [moveView({ move: "surf", name: "Surf", type: "water", pp: 12, maxPp: 15, description: "Una gran ola." })] });
const rival = fighter(4, "Cuatro", 100, 100, { ability: { id: "torrent", name: "Torrente", description: "Potencia el Agua.", active: true }, revealedMoves: [{ move: "hydro-pump", name: "Hidrobomba", type: "water", ppUsed: 2 }] });
const state = (over = {}) => battleState("battle", { moves: [flamethrower, growl], myTeam: [mine, reserve], rivalTeam: [rival], ...over });

afterEach(() => vi.useRealTimers());

describe("los botones de ataque", () => {
  it("con el cursor encima sale su descripción y lo que hace en este juego", async () => {
    const { user } = renderRoom([state()]);
    await user.hover(screen.getByRole("button", { name: /^Gruñido/ }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Gruñe de forma tierna.");
    expect(tip).toHaveTextContent("En Rivalmon: Baja el Ataque del rival");
    expect(screen.getByRole("button", { name: /^Gruñido/ })).toHaveAttribute("aria-describedby", tip.id);
  });

  it("la «i» la abre sin elegir el ataque, también con el teclado", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state()], services);
    await user.click(screen.getByRole("button", { name: "Descripción de Lanzallamas" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ataca con una gran ráfaga de fuego.");
    expect(services.game.client.move).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("mantener pulsado en el móvil la abre y no elige el ataque", () => {
    vi.useFakeTimers();
    const services = fakeServices();
    renderRoom([state()], services);
    const button = screen.getByRole("button", { name: /^Lanzallamas/ });
    fireEvent.pointerDown(button, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ataca con una gran ráfaga de fuego.");
    expect(services.game.client.move).not.toHaveBeenCalled();
    // Un toque normal sí elige.
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(services.game.client.move).toHaveBeenCalledWith("flamethrower");
  });

  it("la descripción se cierra al resolverse el turno", async () => {
    const services = fakeServices();
    const { user } = renderRoom([state()], services);
    await user.click(screen.getByRole("button", { name: "Descripción de Lanzallamas" }));
    serverSends(services, state({ choosing: false, moves: [] }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("la ficha de cada Pokémon", () => {
  it("la mía dice tipos, habilidad y ataques con PP", async () => {
    const { user } = renderRoom([state()]);
    await user.hover(screen.getByRole("button", { name: "Ver la ficha de Uno" }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent(/fuego/i);
    expect(tip).toHaveTextContent("Mar Llamas");
    expect(tip).toHaveTextContent("Lanzallamas");
    expect(tip).toHaveTextContent("PP 30/40");
  });

  it("la del rival, como en Showdown: tipos, habilidad y solo lo que ya usó", async () => {
    const { user } = renderRoom([state()]);
    await user.hover(screen.getByRole("button", { name: "Ver la ficha de Cuatro" }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Torrente");
    expect(tip).toHaveTextContent("Hidrobomba · 2 PP gastados");
    expect(tip).toHaveTextContent("3 ataques sin revelar");
  });

  it("mi equipo enseña los tipos y ataques de cada uno, también de las reservas", async () => {
    const { user } = renderRoom([state()]);
    await user.click(screen.getByRole("button", { name: "Ver tipos y ataques" }));
    const list = screen.getByRole("list", { name: "Tipos y ataques de tu equipo" });
    expect(within(list).getByText("Surf")).toBeInTheDocument();
    expect(list).toHaveTextContent("PP 12/15");
  });
});
