import { describe, expect, it } from "vitest";
import { remember } from "../../src/clues/recent";
import { LETTERS, type Rosco } from "../../src/shared/rosco";
import { RECENT_ROSCOS } from "../../src/shared/word-list";

/** A Rosco whose answers all end in `tag`, so each Rosco's are told apart. */
function rosco(tag: string): Rosco {
  return LETTERS.map((letter) => ({
    letter,
    contains: false,
    text: `Definición de la ${letter}`,
    answer: `${letter.toLowerCase()}${tag}`,
  }));
}

describe("remember", () => {
  it("adds the answers of the Roscos drawn to the Recent Answers", () => {
    const recent = remember([], [rosco("uno"), rosco("dos")]);

    expect(recent.flat()).toContain("auno");
    expect(recent.flat()).toContain("zdos");
    expect(recent.flat()).toHaveLength(2 * LETTERS.length);
  });

  it(`keeps only the answers of the last ${RECENT_ROSCOS} Roscos`, () => {
    let recent = remember([], [rosco("viejo")]);
    for (let drawn = 0; drawn < RECENT_ROSCOS - 1; drawn += 1) {
      recent = remember(recent, [rosco(`${drawn}`)]);
    }
    expect(recent.flat()).toContain("aviejo");

    recent = remember(recent, [rosco("nuevo")]);

    expect(recent.flat()).not.toContain("aviejo");
    expect(recent.flat()).toContain("anuevo");
    expect(recent.flat()).toHaveLength(RECENT_ROSCOS * LETTERS.length);
  });
});
