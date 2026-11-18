import { readFileSync, writeFileSync } from "node:fs";
import { POKEAPI_BASE_URL } from "../src/catalog/pokeapi.js";
import { cleanFlavorText } from "../src/game/auction/move-text.js";

/**
 * Añade a `data/moves.snapshot.json` la descripción en español de cada movimiento que ya está en él (#58), sin tocar los
 * movimientos, las habilidades ni los equipos. Usa el texto de la entrada más reciente en español; sin ninguna, se queda
 * fuera y la pantalla dice solo lo que hace en este juego. `npm run moves:descriptions -w server`
 */
const MAX_ATTEMPTS = 4;
const CONCURRENCY = 16;

interface RawMoveText {
  flavor_text_entries: { flavor_text: string; language: { name: string }; version_group: { url: string } }[];
}

async function fetchJson<T>(path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${POKEAPI_BASE_URL}/${path}`);
      if (response.ok) return (await response.json()) as T;
      throw new Error(`HTTP ${response.status} en ${path}`);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/** El número del grupo de versiones sale de su URL: el mayor es el más reciente. */
const versionOf = (url: string): number => Number(/\/(\d+)\/?$/.exec(url)?.[1] ?? 0);

const file = new URL("../data/moves.snapshot.json", import.meta.url);
const snapshot = JSON.parse(readFileSync(file, "utf8")) as { moves: Record<string, unknown>; descriptions?: Record<string, string> };
const ids = Object.keys(snapshot.moves);
console.log(`Descargando la descripción de ${ids.length} movimientos...`);
const descriptions: Record<string, string> = {};
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < ids.length) {
    const id = ids[next++]!;
    const raw = await fetchJson<RawMoveText>(`move/${id}`);
    const spanish = raw.flavor_text_entries.filter((entry) => entry.language.name === "es").sort((a, b) => versionOf(b.version_group.url) - versionOf(a.version_group.url))[0];
    if (spanish) descriptions[id] = cleanFlavorText(spanish.flavor_text);
  }
}));
const sorted = Object.fromEntries(Object.entries(descriptions).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(file, `${JSON.stringify({ ...snapshot, descriptions: sorted })}\n`);
console.log(`Listo: ${Object.keys(sorted).length} de ${ids.length} movimientos con descripción en español.`);
