import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/client";
import { ProfilePage } from "../../src/pages/profile/ProfilePage";
import { ASH, type FakeServices, fakeServices, renderWithServices, signIn } from "../helpers/services";

function renderProfile({ emailCodes = true, verified = false, route = "/perfil" } = {}) {
  const services: FakeServices = fakeServices();
  vi.mocked(services.endpoints.auth.options).mockResolvedValue({ emailCodes });
  signIn(services, { ...ASH, emailVerified: verified });
  const utils = renderWithServices(
    <Routes>
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/jugador/:username" element={<ProfilePage />} />
    </Routes>,
    { services, route },
  );
  return { ...utils, services, user: userEvent.setup() };
}

describe("el correo en el perfil propio", () => {
  it("sin verificar: dice su estado y ofrece verificarlo", async () => {
    renderProfile();
    expect(await screen.findByText("ash@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sin verificar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verificar" })).toBeInTheDocument();
  });

  it("verificar envía el código, y al escribirlo bien pasa a «Verificado»", async () => {
    const { services, user } = renderProfile();
    await user.click(await screen.findByRole("button", { name: "Verificar" }));
    expect(services.endpoints.auth.sendVerification).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText("Código"), "12 34-56");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(services.endpoints.auth.confirmVerification).toHaveBeenCalledWith("123456");
    expect(await screen.findByText("Verificado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verificar" })).toBeNull();
  });

  it("un código equivocado se dice, y se puede volver a intentar", async () => {
    const { services, user } = renderProfile();
    vi.mocked(services.endpoints.auth.confirmVerification).mockRejectedValueOnce(new ApiError(400, "INVALID_CODE", "Código incorrecto o vencido. Revisa tu correo o pide uno nuevo."));
    await user.click(await screen.findByRole("button", { name: "Verificar" }));
    await user.type(screen.getByLabelText("Código"), "000000");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/Código incorrecto o vencido/)).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });

  it("reenviar espera 60 s tras cada envío", async () => {
    const { user } = renderProfile();
    await user.click(await screen.findByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("button", { name: /Reenviar código/ })).toBeDisabled();
  });

  it("ya verificado: «Verificado» y sin botón", async () => {
    renderProfile({ verified: true });
    expect(await screen.findByText("Verificado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verificar" })).toBeNull();
  });

  it("con el interruptor apagado no aparece la fila", async () => {
    const { services } = renderProfile({ emailCodes: false });
    await waitFor(() => expect(services.endpoints.auth.options).toHaveBeenCalled());
    await screen.findByText("Tu perfil");
    expect(screen.queryByText("Sin verificar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Verificar" })).toBeNull();
  });

  it("en el perfil de otra persona no se ve ni el correo ni la fila", async () => {
    renderProfile({ route: "/jugador/misty" });
    await screen.findByRole("heading", { name: "misty" });
    expect(screen.queryByText("ash@example.com")).toBeNull();
    expect(screen.queryByText("Sin verificar")).toBeNull();
  });
});
