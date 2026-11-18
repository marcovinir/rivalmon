import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fighter, battleState, MY_TEAM } from "../helpers/battle";
import { renderRoom, serverSends } from "../helpers/room";
import { fakeServices } from "../helpers/services";

/** #57: al caer un Pokémon se elige al siguiente en la misma pantalla de combate, sin K.O. ni pausa. */
const fallenTeam = [fighter(1, "Uno", 0), fighter(2, "Dos", 63), fighter(3, "Tres", 0), fighter(7, "Siete")];

describe("elegir al siguiente Pokémon", () => {
  it("quien perdió a su titular ve «¿Quién sale ahora?» con sus vivos, en lugar de los ataques", async () => {
    const services = fakeServices();
    const { user } = renderRoom([battleState("battle", { choosing: false, moves: [], mustReplace: true, myTeam: fallenTeam })], services);
    expect(screen.getByRole("heading", { name: "¿Quién sale ahora?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lanzallamas/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sacar a Tres" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sacar a Uno" })).toBeNull();
    expect(screen.getByText("Tu rival no ve a quién eliges hasta que salga.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sacar a Dos" }));
    expect(services.game.client.switchTo).toHaveBeenCalledWith(2);
  });

  it("lo elegido queda marcado al recargar y, si el rival también elige, se le espera", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [], mustReplace: true, rivalReplacing: true, myReplacement: 7, confirmed: true, myTeam: fallenTeam })]);
    expect(screen.getByRole("button", { name: "Sacar a Siete" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Esperando a misty…")).toBeInTheDocument();
  });

  it("el rival ve que estoy eligiendo, en la misma pantalla", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [], rivalReplacing: true })]);
    const visible = screen.getAllByText("misty está eligiendo a su siguiente Pokémon…").filter((one) => !one.closest('[role="log"]'));
    expect(visible).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "¿Quién sale ahora?" })).toBeNull();
  });

  it("no hay rótulo de K.O.: el debilitado se desvanece", () => {
    const services = fakeServices();
    renderRoom([battleState("battle", { choosing: false, moves: [], rivalTeam: [fighter(4, "Cuatro", 0)] })], services);
    serverSends(services, { name: "battle-fainted", payload: { fallen: [2], atLimit: false } });
    expect(screen.queryByText("K.O.")).toBeNull();
    expect(screen.getByRole("img", { name: "Cuatro" }).closest(".battle-fainted")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Uno" }).closest(".battle-fainted")).toBeNull();
  });
});

describe("el debilitado (#68)", () => {
  it("pierde el aura de su estado: ya no pelea", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [], rivalTeam: [fighter(4, "Cuatro", 0, 100, { status: "poison" })] })]);
    const spot = screen.getByRole("img", { name: "Cuatro" }).closest(".battle-spot")!;
    expect(spot).toHaveClass("battle-fainted");
    expect(spot.className).not.toMatch(/battle-aura/);
  });
});

describe("el contador", () => {
  it("dice solo el turno; en los últimos 5 antes del límite avisa de él", () => {
    const { unmount } = renderRoom([battleState("battle", { round: 3, turn: 7, calmTurns: 14 })]);
    expect(screen.getByText("Turno 7")).toBeInTheDocument();
    unmount();
    // Ya resueltos 15 sin caídas: el que se elige ahora es el 16.º de 20.
    const { unmount: again } = renderRoom([battleState("battle", { turn: 27, calmTurns: 15, myTeam: MY_TEAM })]);
    expect(screen.getByText("Turno 27 · Límite 16/20")).toBeInTheDocument();
    again();
    renderRoom([battleState("battle", { turn: 31, calmTurns: 19, myTeam: MY_TEAM })]);
    expect(screen.getByText("Turno 31 · Límite 20/20")).toBeInTheDocument();
  });
});

describe("lo que dice la revisión independiente", () => {
  afterEach(() => vi.useRealTimers());

  it("si caen los dos, el debilitado del rival no reaparece mientras entra mi reemplazo", () => {
    vi.useFakeTimers();
    const services = fakeServices();
    const both = { choosing: false, moves: [], myTeam: fallenTeam, rivalTeam: [fighter(4, "Cuatro", 0), fighter(5, "Cinco")] };
    renderRoom([battleState("battle", { ...both, round: 1, turn: 3 })], services);
    serverSends(services, { name: "battle-turn", payload: { round: 2, turn: 3, actions: [], switches: [{ seat: 1, pokemonId: 2 }, { seat: 2, pokemonId: 5 }] } });
    serverSends(services, battleState("battle", { ...both, round: 2, turn: 3, myTitular: 2, rivalTitular: 5 }));
    // Primer paso: entra el mío; el del rival sigue caído y desvanecido.
    expect(screen.getByRole("img", { name: "Dos" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cuatro" }).closest(".battle-fainted")).not.toBeNull();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("img", { name: "Cinco" }).closest(".battle-fainted")).toBeNull();
  });

  it("al lector se le dice que tiene que elegir, y al rival que espera; el foco va a la primera opción", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [], mustReplace: true, myTeam: fallenTeam })]);
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("¿Quién sale ahora?");
    expect(screen.getByRole("button", { name: "Sacar a Dos" })).toHaveFocus();
  });

  it("el rival oye que estoy eligiendo", () => {
    renderRoom([battleState("battle", { choosing: false, moves: [], rivalReplacing: true })]);
    expect(screen.getByRole("log", { name: "Anuncios de la partida" })).toHaveTextContent("misty está eligiendo a su siguiente Pokémon…");
  });
});
