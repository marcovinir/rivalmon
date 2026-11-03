import { TYPE_NAMES, type TypeName } from "@pokemon-minigames/shared";
import type { CSSProperties, ReactNode } from "react";
import { useReducedMotion } from "../game/motion";
import { mixHex } from "../theme/contrast";
import { TYPE_STYLES } from "../theme/type-styles";
import { ATTACK_EFFECTS, GENERIC_EFFECT, type Particle, type ShapeName } from "./attack-effects";

/** El filo oscuro de cada forma: es lo que las separa de los cuatro escenarios, también de los más claros. */
const OUTLINE = "#1b1147";

/** El color de Forcejeo, que no tiene tipo. */
const GENERIC_COLOR = "#d9d6e8";

/** Una línea de un Pokémon al otro, con filo oscuro, color y brillo. Su grosor no se deforma con el ancho de la arena. */
function Beam({ path, color, light, width }: { path: string; color: string; light: string; width: number }) {
  const layers = [
    { stroke: OUTLINE, strokeWidth: width + 3 },
    { stroke: color, strokeWidth: width },
    { stroke: light, strokeWidth: width / 3 },
  ];
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {layers.map(({ stroke, strokeWidth }) => (
        <path key={stroke} d={path} stroke={stroke} vectorEffect="non-scaling-stroke" style={{ strokeWidth: `calc(${strokeWidth}px * var(--attack-scale))` }} />
      ))}
    </g>
  );
}

const line = (d: string, color: string, width: number) => <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;

/** Las formas apuntan hacia +x y caben en una caja de 24 × 24 centrada en el origen; las líneas van de (0, 100), abajo a la izquierda, a (100, 0). */
const SHAPES: Record<ShapeName, ReactNode> = {
  flame: (
    <>
      <path d="M11.5 0C6-7-2-9.5-10.5-6.5-7.5-3.5-8.5-2-11.5 0-8.5 2-7.5 3.5-10.5 6.5-2 9.5 6 7 11.5 0Z" fill="#ee8130" />
      <path d="M7 0C3-3.5-2-4-6-2.5-4.5-1-4.5 1-6 2.5-2 4 3 3.5 7 0Z" fill="#ffd93b" stroke="none" />
    </>
  ),
  drop: (
    <>
      <path d="M11.5 0C5-5-2-8.5-7-6.5A7 7 0 0 0-7 6.5C-2 8.5 5 5 11.5 0Z" fill="#6390f0" />
      <circle cx="-5" cy="-2.5" r="1.8" fill="#dbe7ff" stroke="none" />
    </>
  ),
  stream: <Beam path="M0 100C25 60 30 95 50 50S75 35 100 0" color="#6390f0" light="#dbe7ff" width={9} />,
  bolt: <Beam path="M0 100L24 40 34 100 58 20 68 75 100 0" color="#f7d02c" light="#ffffff" width={5} />,
  boltAlt: <Beam path="M0 100L18 120 38 45 50 95 72 0 80 45 100 0" color="#f7d02c" light="#ffffff" width={4} />,
  leaf: (
    <>
      <path d="M11.5 0C5-8-5-8-11.5 0-5 8 5 8 11.5 0Z" fill="#7ac74c" />
      <path d="M-8 0H8" fill="none" stroke="#2f6b1c" strokeWidth="1.2" />
    </>
  ),
  shard: (
    <>
      <path d="M11.5 0 3-5-9-3-11.5 0-9 3 3 5Z" fill="#96d9d6" />
      <path d="M8 0 2-2.5-8-1Z" fill="#ffffff" stroke="none" />
    </>
  ),
  flake: (
    <>
      {line("M0-11V11M-9.5-5.5 9.5 5.5M-9.5 5.5 9.5-5.5", OUTLINE, 3.6)}
      {line("M0-11V11M-9.5-5.5 9.5 5.5M-9.5 5.5 9.5-5.5", "#d8f6f4", 1.8)}
    </>
  ),
  fist: (
    <>
      <rect x="-9" y="-9" width="18" height="18" rx="5.5" fill="#c22e28" />
      <path d="M-8 3.5H0Q2 3.5 2 6T0 8.5H-5" fill="#e4574f" />
      {line("M3.5-5.5H8.5M3.5-1.5H8.5M4.5 2.5H8.5", OUTLINE, 1.2)}
    </>
  ),
  crescent: (
    <>
      <path d="M1-11.5C11.5-6 11.5 6 1 11.5 6 4 6-4 1-11.5Z" fill="#a98ff3" />
      <path d="M4.5-5C7.5-2 7.5 2 4.5 5 5.5 2 5.5-2 4.5-5Z" fill="#ffffff" stroke="none" />
    </>
  ),
  bubble: (
    <>
      <circle r="10.5" fill="#a33ea1" />
      <circle cx="-3.5" cy="-4" r="2.5" fill="#f0c3ef" stroke="none" />
    </>
  ),
  spike: (
    <>
      <path d="M-10 11.5-2-11.5 2.5-4 10 11.5Z" fill="#e2bf65" />
      <path d="M-2-11.5 2.5-4 10 11.5H1Z" fill="#a9823a" stroke="none" />
    </>
  ),
  rock: (
    <>
      <path d="M-9-5-2-11 7-8 11.5 1 5 10.5-6 9.5-11.5 2Z" fill="#b6a136" />
      <path d="M-2-11 1-2-9-5ZM1-2 11.5 1 7-8Z" fill="#d6c565" stroke="none" />
    </>
  ),
  bug: (
    <>
      <ellipse cx="-1" cy="-6" rx="6" ry="3.6" fill="#e8f2a5" />
      <ellipse cx="-1" cy="6" rx="6" ry="3.6" fill="#e8f2a5" />
      <ellipse cx="1" rx="9" ry="5" fill="#a6b91a" />
    </>
  ),
  ghost: (
    <>
      <path d="M-9 11V-2A9 9 0 0 1 9-2V11L4.5 7.5 0 11-4.5 7.5Z" fill="#735797" />
      <circle cx="-3.5" cy="-2" r="2.4" fill="#ffffff" stroke="none" />
      <circle cx="3.5" cy="-2" r="2.4" fill="#ffffff" stroke="none" />
    </>
  ),
  saw: (
    <>
      <path d="M12 0 6.5 3.8 6 10.4 0 7.5-6 10.4-6.5 3.8-12 0-6.5-3.8-6-10.4 0-7.5 6-10.4 6.5-3.8Z" fill="#b7b7ce" />
      <circle r="3" fill="#ffffff" />
    </>
  ),
  ring: (
    <>
      <circle r="10" fill="none" stroke={OUTLINE} strokeWidth="4" />
      <circle r="10" fill="none" stroke="var(--effect-color)" strokeWidth="2.4" />
      <circle r="5" fill="none" stroke="var(--effect-light)" strokeWidth="1.2" />
    </>
  ),
  comet: (
    <>
      <path d="M12 0C5-6-4-6-11.5-9-8-3-8 3-11.5 9-4 6 5 6 12 0Z" fill="#6f35fc" />
      <path d="M7 0C3-2-2-2-5-3-4-1-4 1-5 3-2 2 3 2 7 0Z" fill="#ffcb05" stroke="none" />
    </>
  ),
  claw: (
    <>
      {line("M-7-10.5Q-3 0-10 10.5M1-11.5Q5 0-2 11.5M9-10.5Q13 0 6 10.5", "#ffffff", 3.4)}
      {line("M-7-10.5Q-3 0-10 10.5M1-11.5Q5 0-2 11.5M9-10.5Q13 0 6 10.5", "#3a2a22", 1.8)}
    </>
  ),
  sparkle: (
    <>
      <path d="M0-12Q1.5-1.5 12 0 1.5 1.5 0 12-1.5 1.5-12 0-1.5-1.5 0-12Z" fill="#f4bdd9" />
      <circle r="1.8" fill="#ffffff" stroke="none" />
    </>
  ),
  heart: (
    <>
      <path d="M0 11C-14 2-11-9-5.5-9-2.5-9-1-7 0-5 1-7 2.5-9 5.5-9 11-9 14 2 0 11Z" fill="#d685ad" />
      <circle cx="-5" cy="-4" r="1.8" fill="#ffffff" stroke="none" />
    </>
  ),
  orb: (
    <>
      <circle r="10.5" fill="var(--effect-color)" />
      <circle cx="-3" cy="-3.5" r="3" fill="var(--effect-light)" stroke="none" />
    </>
  ),
  burst: (
    <>
      <path d="M12 0 4.6 1.9 8.5 8.5 1.9 4.6 0 12-1.9 4.6-8.5 8.5-4.6 1.9-12 0-4.6-1.9-8.5-8.5-1.9-4.6 0-12 1.9-4.6 8.5-8.5 4.6-1.9Z" fill="var(--effect-color)" />
      <path d="M6 0 2.2 1 4 4 1 2.2 0 6-1 2.2-4 4-2.2 1-6 0-2.2-1-4-4-1-2.2 0-6 1-2.2 4-4 2.2-1Z" fill="var(--effect-light)" stroke="none" />
    </>
  ),
};

/** Las que tienen punta: miran hacia donde van, según el sentido del ataque. */
const AIMED = new Set<ShapeName>(["flame", "drop", "shard", "fist", "crescent", "comet"]);
const LINES = new Set<ShapeName>(["stream", "bolt", "boltAlt"]);

const isType = (type: TypeName | null): type is TypeName => type !== null && (TYPE_NAMES as readonly string[]).includes(type);

function ParticleView({ shape, motion, delay, duration, size, x = 0, y = 0, along = 0, spin = false }: Particle) {
  const isLine = LINES.has(shape);
  const style = { "--delay": `${delay}ms`, "--duration": `${duration}ms`, "--size": `${size}px`, "--x": `${x}px`, "--y": `${y}px`, "--along": along } as CSSProperties;
  return (
    <span data-particle className={`attack-particle attack-${motion}`} style={style}>
      <span className="attack-anchor">
        <svg className={`attack-shape${AIMED.has(shape) ? " attack-aimed" : ""}${spin ? " attack-spin" : ""}`} viewBox={isLine ? "0 0 100 100" : "-12 -12 24 24"} preserveAspectRatio={isLine ? "none" : undefined}>
          {isLine ? (
            SHAPES[shape]
          ) : (
            <g stroke={OUTLINE} strokeWidth="1.2" strokeLinejoin="round">
              {SHAPES[shape]}
            </g>
          )}
        </svg>
      </span>
    </span>
  );
}

/**
 * El efecto de un ataque, del atacante al defensor, hecho solo con SVG y CSS. Llena la arena: hay que colocarlo dentro de
 * `[data-arena]`, después de los sprites y antes de los recuadros de PS, para que no los tape. Para repetirlo en el golpe
 * siguiente hay que darle otra `key`; al acabar queda invisible y sin recibir toques.
 *
 * `from="left"` lo lanza el Pokémon de abajo a la izquierda (el tuyo) y `from="right"`, el de arriba a la derecha. `type`
 * es el tipo del movimiento, no el del Pokémon; `null` es Forcejeo, que no tiene tipo y usa el efecto genérico. Con
 * «reducir movimiento» se queda en un destello sobre el defensor.
 */
export function AttackEffect({ type, from }: { type: TypeName | null; from: "left" | "right" }) {
  const reduced = useReducedMotion();
  const known = isType(type);
  const particles = known ? ATTACK_EFFECTS[type] : GENERIC_EFFECT;
  const color = known ? TYPE_STYLES[type].background : GENERIC_COLOR;
  const colors = { "--effect-color": color, "--effect-light": mixHex(color, "#ffffff", 0.75) } as CSSProperties;
  return (
    <div data-attack-effect data-type={known ? type : "generic"} data-from={from} aria-hidden="true" className="attack-effect" style={colors}>
      {reduced ? <span className="attack-flash" /> : particles.map((particle, index) => <ParticleView key={index} {...particle} />)}
    </div>
  );
}
