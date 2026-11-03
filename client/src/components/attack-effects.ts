import type { TypeName } from "@pokemon-minigames/shared";

/** Las formas de los efectos: se dibujan en `AttackEffect.tsx`. */
export type ShapeName = "flame" | "drop" | "stream" | "bolt" | "boltAlt" | "leaf" | "shard" | "flake" | "fist" | "crescent" | "bubble" | "spike" | "rock" | "bug" | "ghost" | "saw" | "ring" | "comet" | "claw" | "sparkle" | "heart" | "orb" | "burst";

/**
 * Cómo se mueve cada pieza (sus fotogramas están en `index.css`): `fly` va recta del atacante al defensor, `arc` va por
 * lo alto, `weave` y `weave-back` van serpenteando (en sentidos opuestos), `strike` aparece sobre el defensor, `rise` sale
 * del suelo en un punto del camino, y `beam` y `flicker` son una línea entera entre los dos: uno se extiende, el otro parpadea.
 */
export type Motion = "fly" | "arc" | "weave" | "weave-back" | "strike" | "rise" | "beam" | "flicker";

export interface Particle {
  shape: ShapeName;
  motion: Motion;
  /** Cuándo empieza, en milisegundos. */
  delay: number;
  /** Cuánto dura, en milisegundos. `delay + duration` no llega a 1000: el efecto cabe en el golpe. */
  duration: number;
  /** El lado en píxeles en un móvil; en escritorio se agranda, igual que los sprites. Las líneas no lo usan: van de un Pokémon al otro. */
  size: number;
  /** Cuánto se separa de la línea que va del atacante al defensor, en píxeles. */
  x?: number;
  y?: number;
  /** En qué punto del camino sale, de 0 (el atacante, si no se dice) a 1 (el defensor). */
  along?: number;
  /** Gira sobre sí misma mientras viaja. */
  spin?: boolean;
}

type StreamOptions = Pick<Particle, "delay" | "duration" | "size" | "spin"> & {
  every: number;
  /** Cuánto cambia el tamaño de una pieza a la siguiente. */
  grow?: number;
  /** Si son varios, las piezas se van alternando entre ellos. */
  motions: Motion[];
};

/** Separaciones fijas, no al azar: el efecto se ve igual en las dos pantallas y en cada golpe. */
const SCATTER = [
  [0, 0],
  [5, -9],
  [-4, 8],
  [8, 5],
  [-7, -6],
  [3, 11],
  [-2, -12],
  [6, 3],
] as const;

/** Varias piezas iguales, una tras otra. */
function stream(shape: ShapeName, count: number, { delay, every, duration, size, grow = 0, spin, motions }: StreamOptions): Particle[] {
  return Array.from({ length: count }, (_, index) => {
    const [x, y] = SCATTER[index % SCATTER.length]!;
    return { shape, motion: motions[index % motions.length]!, delay: delay + every * index, duration, size: size + grow * index, x, y, spin };
  });
}

const strike = (shape: ShapeName, delay: number, duration: number, size: number, x = 0, y = 0): Particle => ({ shape, motion: "strike", delay, duration, size, x, y, along: 1 });

/** Un efecto por tipo. Cada uno se reconoce por su forma y su movimiento, no solo por su color. */
export const ATTACK_EFFECTS: Record<TypeName, Particle[]> = {
  // Golpe seco: una bola recta y una onda al llegar.
  normal: [{ shape: "orb", motion: "fly", delay: 0, duration: 340, size: 26 }, strike("burst", 290, 340, 64), strike("ring", 330, 400, 84)],
  // Un puñetazo rapidísimo y tres impactos seguidos.
  fighting: [{ shape: "fist", motion: "fly", delay: 0, duration: 300, size: 46 }, strike("burst", 250, 260, 64), strike("burst", 390, 260, 52, -16, -14), strike("burst", 530, 280, 58, 15, 12)],
  // Cuchillas de aire.
  flying: [...stream("crescent", 4, { delay: 0, every: 110, duration: 400, size: 40, motions: ["fly"] }), ...stream("crescent", 3, { delay: 170, every: 110, duration: 460, size: 22, motions: ["weave"] })],
  // Burbujas que caen y revientan encima.
  poison: [...stream("bubble", 6, { delay: 0, every: 70, duration: 470, size: 20, grow: 2, motions: ["arc"] }), strike("bubble", 440, 300, 44), strike("bubble", 530, 300, 30, 20, -17), strike("bubble", 600, 280, 26, -22, 12)],
  // Púas que salen del suelo hasta llegar al defensor.
  ground: [...[0.12, 0.28, 0.44, 0.6, 0.76, 0.92].map((along, index): Particle => ({ shape: "spike", motion: "rise", delay: 70 * index, duration: 380, size: 30 + 4 * index, along, y: 10 })), strike("burst", 430, 360, 62, 0, 10)],
  // Tres rocas que vuelan girando y caen a plomo.
  rock: [...stream("rock", 3, { delay: 0, every: 130, duration: 480, size: 38, grow: -3, spin: true, motions: ["arc"] }), strike("burst", 440, 340, 66), strike("rock", 520, 300, 22, 22, -12)],
  // Un enjambre que zigzaguea.
  bug: stream("bug", 10, { delay: 0, every: 45, duration: 440, size: 21, motions: ["weave", "weave-back"] }),
  // Fantasmas que ondean hasta el defensor.
  ghost: [...stream("ghost", 3, { delay: 0, every: 120, duration: 560, size: 34, motions: ["weave", "weave-back"] }), strike("ghost", 540, 320, 56)],
  // Sierras que cortan el aire y un chispazo metálico.
  steel: [...stream("saw", 3, { delay: 0, every: 100, duration: 360, size: 36, spin: true, motions: ["fly"] }), strike("burst", 340, 300, 62), strike("saw", 460, 340, 46)],
  // La llamarada: cada lengua sale más grande y al final estalla.
  fire: [...stream("flame", 8, { delay: 0, every: 50, duration: 400, size: 24, grow: 4, motions: ["fly"] }), strike("flame", 430, 320, 62, -8, 6), strike("burst", 460, 380, 76)],
  // El chorro, con gotas alrededor y salpicadura al llegar.
  water: [{ shape: "stream", motion: "beam", delay: 0, duration: 680, size: 0 }, ...stream("drop", 5, { delay: 60, every: 85, duration: 360, size: 20, motions: ["fly"] }), strike("burst", 360, 420, 66), strike("drop", 480, 300, 26, 22, -14), strike("drop", 540, 300, 22, -20, -8)],
  // Hojas afiladas que giran.
  grass: stream("leaf", 7, { delay: 0, every: 70, duration: 500, size: 30, spin: true, motions: ["weave", "weave-back", "fly"] }),
  // El rayo: dos trazos que parpadean y una descarga en el defensor.
  electric: [{ shape: "bolt", motion: "flicker", delay: 0, duration: 520, size: 0 }, { shape: "boltAlt", motion: "flicker", delay: 170, duration: 520, size: 0 }, strike("burst", 300, 300, 72), strike("burst", 490, 320, 56, 12, -10)],
  // Ondas que se agrandan por el camino.
  psychic: [...stream("ring", 5, { delay: 0, every: 90, duration: 470, size: 26, grow: 8, motions: ["fly"] }), strike("ring", 500, 360, 92)],
  // Cristales rectos y un copo al llegar.
  ice: [...stream("shard", 6, { delay: 0, every: 55, duration: 360, size: 30, motions: ["fly"] }), strike("flake", 370, 450, 74)],
  // Dos energías que se enroscan mientras avanzan.
  dragon: [...stream("comet", 8, { delay: 0, every: 55, duration: 480, size: 34, motions: ["weave", "weave-back"] }), strike("burst", 470, 370, 76)],
  // Una sombra y dos zarpazos.
  dark: [{ shape: "orb", motion: "arc", delay: 0, duration: 320, size: 30 }, strike("claw", 280, 300, 72, -6, -4), strike("claw", 450, 320, 80, 8, 6)],
  // Destellos que titilan y un corazón al final.
  fairy: [...stream("sparkle", 7, { delay: 0, every: 60, duration: 470, size: 26, spin: true, motions: ["weave", "weave-back"] }), strike("heart", 470, 380, 58)],
};

/** Para Forcejeo, que no tiene tipo: lo más simple que se lee como un golpe. */
export const GENERIC_EFFECT: Particle[] = [{ shape: "orb", motion: "weave", delay: 0, duration: 360, size: 22 }, strike("burst", 310, 360, 60)];
