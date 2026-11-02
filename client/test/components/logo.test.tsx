import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, LogoMark } from "../../src/components/Logo";

describe("Logo", () => {
  it("la bola es decorativa: no la leen los lectores de pantalla ni recibe el foco", () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("el logo dice el nombre del juego como texto (es lo que da nombre accesible al enlace del encabezado)", () => {
    render(<Logo />);
    expect(screen.getByText("Rivalmon")).toBeInTheDocument();
  });

  it("la bola es de diseño propio: mitades azul y roja con banda amarilla", () => {
    const { container } = render(<LogoMark />);
    const html = container.innerHTML;
    for (const color of ["#2563d9", "#e5352b", "#ffcb05"]) expect(html).toContain(color);
  });

  it("el logo lleva las letras dibujadas, y sin sitio se queda solo la bola", () => {
    const { container } = render(<Logo hideNameOnMobile />);
    const word = container.querySelector("[data-logo-word]")!;
    expect(word.querySelectorAll("path[d]").length).toBeGreaterThanOrEqual(2);
    expect(word).toHaveClass("max-sm:hidden");
    expect(screen.getByText("Rivalmon")).toHaveClass("sr-only");
  });

  it("la bola tiene el tamaño pedido", () => {
    const { container } = render(<LogoMark size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
  });
});
