import { describe, expect, it } from "vitest";
import { cleanFlavorText } from "../../src/game/auction/move-text.js";

describe("el texto oficial de un movimiento", () => {
  it("queda en una línea, sin los cortes de palabra del juego original", () => {
    expect(cleanFlavorText("Ataca con una\nintensa lla-\nmarada.\fPuede quemar.")).toBe("Ataca con una intensa llamarada. Puede quemar.");
  });
});
