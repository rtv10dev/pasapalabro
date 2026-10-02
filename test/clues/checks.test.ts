import { describe, expect, it } from "vitest";
import { checkClue } from "../../src/clues/checks";
import type { Letter } from "../../src/shared/rosco";

const TEXT = "Una definición cualquiera";

function check(
  letter: Letter,
  answer: string,
  { contains = false, text = TEXT, earlier = [] as string[] } = {},
) {
  return checkClue({ letter, contains, text, answer }, earlier);
}

describe("checkClue", () => {
  it("accepts a one-word answer that starts with its letter", () => {
    const clue = {
      letter: "A",
      contains: false,
      text: "Fruto del manzano",
      answer: "manzana",
    } as const;

    expect(checkClue({ ...clue, letter: "M" }, [])).toBeNull();
    expect(checkClue(clue, [])).toBe("letter-rule");
  });

  it("ignores accents and case in the answer", () => {
    expect(check("A", "Árbol")).toBeNull();
    expect(check("U", "último")).toBeNull();
  });

  it("tells Ñ apart from N", () => {
    expect(check("Ñ", "ñandú")).toBeNull();
    expect(check("N", "ñandú")).toBe("letter-rule");
    expect(check("Ñ", "nandu")).toBe("letter-rule");
  });

  it("lets X, Y and Ñ be contained in the answer", () => {
    expect(check("X", "taxi", { contains: true })).toBeNull();
    expect(check("Y", "playa", { contains: true })).toBeNull();
    expect(check("Ñ", "piñata", { contains: true })).toBeNull();
    expect(check("Ñ", "pinata", { contains: true })).toBe("letter-rule");
    expect(check("X", "tapa", { contains: true })).toBe("letter-rule");
  });

  it("requires every other letter to start the answer", () => {
    expect(check("B", "abeja", { contains: true })).toBe("letter-rule");
  });

  it("requires the answer to be one word", () => {
    expect(check("C", "caballo de mar")).toBe("not-one-word");
    expect(check("C", "contra-reloj")).toBe("not-one-word");
    expect(check("C", "")).toBe("not-one-word");
    expect(check("P", " pingüino ")).toBeNull();
  });

  it("refuses a Clue that contains its own answer", () => {
    expect(
      check("P", "perro", { text: "Animal que ladra, como el perro" }),
    ).toBe("answer-in-clue");
    expect(check("A", "árbol", { text: "Planta como el ARBOL" })).toBe(
      "answer-in-clue",
    );
    expect(check("O", "oso", { text: "Mamífero peligroso" })).toBeNull();
  });

  it("refuses a Clue with a word that starts with its answer, like a plural", () => {
    expect(check("P", "perro", { text: "Uno de los perros del pastor" })).toBe(
      "answer-in-clue",
    );
    expect(check("O", "oso", { text: "Osos y ositos" })).toBeNull();
  });

  it("refuses a Clue with no text", () => {
    expect(check("P", "perro", { text: "  " })).toBe("empty-clue");
  });

  it("refuses an answer already in the Rosco, whatever its accents or case", () => {
    expect(check("P", "pérez", { earlier: ["abeja", "PEREZ"] })).toBe(
      "repeated",
    );
    expect(check("P", "peña", { earlier: ["pena"] })).toBeNull();
  });
});
