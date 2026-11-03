import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttackEffect } from "../../src/components/AttackEffect";
import { ATTACK_EFFECTS, GENERIC_EFFECT, type Particle } from "../../src/components/attack-effects";

const css = readFileSync(join(import.meta.dirname, "../../src/index.css"), "utf8");

const particlesOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-particle]")];
const reduceMotion = () => vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));

/** Lo que distingue a un efecto a simple vista: qué formas usa y cómo se mueven. */
const signature = (particles: Particle[]) => [...new Set(particles.map((one) => `${one.shape}/${one.motion}`))].sort().join(" ");

afterEach(() => vi.unstubAllGlobals());

describe("AttackEffect", () => {
  it.each(TYPE_NAMES)("%s tiene su efecto y se dibuja sin imágenes", (type) => {
    const { container } = render(<AttackEffect type={type} from="left" />);
    expect(ATTACK_EFFECTS[type].length).toBeGreaterThan(0);
    expect(container.querySelector("[data-attack-effect]")).toHaveAttribute("data-type", type);
    expect(particlesOf(container)).toHaveLength(ATTACK_EFFECTS[type].length);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    expect(container.querySelector("img")).toBeNull();
  });

  it("los 18 efectos y el genérico se distinguen entre sí", () => {
    const signatures = [...TYPE_NAMES.map((type) => signature(ATTACK_EFFECTS[type])), signature(GENERIC_EFFECT)];
    expect(TYPE_NAMES).toHaveLength(18);
    expect(new Set(signatures).size).toBe(19);
  });

  it.each([...TYPE_NAMES, null] as (TypeName | null)[])("%s termina antes de 1 s, contando los retardos", (type) => {
    const { container } = render(<AttackEffect type={type} from="left" />);
    const particles = particlesOf(container);
    expect(particles.length).toBeGreaterThan(0);
    for (const particle of particles) {
      const end = Number.parseFloat(particle.style.getPropertyValue("--delay")) + Number.parseFloat(particle.style.getPropertyValue("--duration"));
      expect(end).toBeGreaterThan(0);
      expect(end).toBeLessThan(1000);
    }
  });

  it.each(["left", "right"] as const)("indica el sentido desde %s, también con el destello", (from) => {
    expect(render(<AttackEffect type="fire" from={from} />).container.querySelector("[data-attack-effect]")).toHaveAttribute("data-from", from);
    reduceMotion();
    expect(render(<AttackEffect type="fire" from={from} />).container.querySelector("[data-attack-effect]")).toHaveAttribute("data-from", from);
  });

  it("sin tipo (Forcejeo) usa el efecto genérico", () => {
    const { container } = render(<AttackEffect type={null} from="right" />);
    expect(container.querySelector("[data-attack-effect]")).toHaveAttribute("data-type", "generic");
    expect(particlesOf(container)).toHaveLength(GENERIC_EFFECT.length);
  });

  it("un tipo desconocido (solo con datos corruptos) también usa el genérico", () => {
    const { container } = render(<AttackEffect type={"constructor" as TypeName} from="left" />);
    expect(container.querySelector("[data-attack-effect]")).toHaveAttribute("data-type", "generic");
    expect(particlesOf(container)).toHaveLength(GENERIC_EFFECT.length);
  });

  it("es decorativo: los lectores de pantalla no lo anuncian", () => {
    const { container } = render(<AttackEffect type="water" from="left" />);
    expect(container.querySelector("[data-attack-effect]")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([...TYPE_NAMES, null] as (TypeName | null)[])("con «reducir movimiento», %s es solo un destello", (type) => {
    reduceMotion();
    const { container } = render(<AttackEffect type={type} from="left" />);
    expect(particlesOf(container)).toHaveLength(0);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll(".attack-flash")).toHaveLength(1);
  });
});

describe("los estilos de los efectos", () => {
  const motions = [...new Set([...TYPE_NAMES.flatMap((type) => ATTACK_EFFECTS[type]), ...GENERIC_EFFECT].map((one) => one.motion))];

  it.each(motions)("el movimiento %s tiene su clase y sus fotogramas", (motion) => {
    const rule = new RegExp(String.raw`\.attack-${motion} \{[^}]*animation-name: ([\w-]+);`).exec(css);
    expect(rule).not.toBeNull();
    expect(css).toContain(`@keyframes ${rule![1]} {`);
  });

  it("el destello gana a la regla global de «reducir movimiento», escrita antes", () => {
    const global = css.indexOf("animation-duration: 0.01ms !important");
    const flash = /\.attack-flash\s*\{\s*animation-duration:\s*\d+ms !important;/.exec(css);
    expect(global).toBeGreaterThan(-1);
    expect(flash).not.toBeNull();
    expect(flash!.index).toBeGreaterThan(global);
  });

  it("no se sale de la arena ni recibe los toques de los botones que tiene debajo", () => {
    const rule = /\.attack-effect \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("pointer-events: none");
  });
});
