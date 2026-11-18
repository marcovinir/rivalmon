/** PokeAPI trae saltos de línea y guiones de corte del juego original: se dejan en una sola línea. */
export function cleanFlavorText(text: string): string {
  return text.replace(/-\n/g, "").replace(/[\n\f­]+/g, " ").replace(/\s+/g, " ").trim();
}
