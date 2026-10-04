import { describe, expect, it } from "vitest";
import { wikcionarioUrl } from "../../src/client/wikcionario";

describe("wikcionarioUrl", () => {
  it("links to the Word's entry on Wikcionario", () => {
    expect(wikcionarioUrl("casa")).toBe("https://es.wiktionary.org/wiki/casa");
  });

  it("encodes accents and Ñ", () => {
    expect(wikcionarioUrl("ábaco")).toBe(
      "https://es.wiktionary.org/wiki/%C3%A1baco",
    );
    expect(wikcionarioUrl("ñandú")).toBe(
      "https://es.wiktionary.org/wiki/%C3%B1and%C3%BA",
    );
  });

  it("uses the composed form, as Wikcionario's titles do", () => {
    // "n" followed by a combining tilde, as some keyboards type it.
    expect(wikcionarioUrl("an\u0303o")).toBe(wikcionarioUrl("año"));
  });

  it("links to the lowercase entry, where the Words are", () => {
    expect(wikcionarioUrl("Ñandú")).toBe(wikcionarioUrl("ñandú"));
  });

  it("joins the words of a multi-word answer with underscores", () => {
    expect(wikcionarioUrl(" a menudo ")).toBe(
      "https://es.wiktionary.org/wiki/a_menudo",
    );
  });
});
