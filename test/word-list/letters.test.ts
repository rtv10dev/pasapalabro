import { describe, expect, it } from "vitest";
import { lettersFor } from "../../src/shared/word-list";

describe("lettersFor", () => {
  it("gives the letter a Word starts with, ignoring accents and case", () => {
    expect(lettersFor("árbol")).toEqual(["A"]);
    expect(lettersFor("Último")).toEqual(["U"]);
  });

  it("tells Ñ apart from N", () => {
    expect(lettersFor("ñandú")).toEqual(["Ñ"]);
    expect(lettersFor("nandú")).toEqual(["N"]);
  });

  it("adds Ñ, X and Y wherever the Word contains them, in Rosco order", () => {
    expect(lettersFor("piñata")).toEqual(["Ñ", "P"]);
    expect(lettersFor("taxi")).toEqual(["T", "X"]);
    expect(lettersFor("xilófono")).toEqual(["X"]);
    expect(lettersFor("niño")).toEqual(["N", "Ñ"]);
  });

  it("gives nothing for a Word only K or W could answer", () => {
    expect(lettersFor("kilo")).toEqual([]);
    expect(lettersFor("kayak")).toEqual(["Y"]);
  });
});
