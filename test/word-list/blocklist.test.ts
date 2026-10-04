import { describe, expect, it } from "vitest";
import {
  parseBlocklist,
  parseCuss,
  parseLdnoobw,
} from "../../scripts/word-list/blocklist";

describe("parseBlocklist", () => {
  it("reads one Word per line, without comments or blank lines", () => {
    const text = [
      "# Slurs and clearly vulgar Words.",
      "",
      "polla  # sexual sense as its Clue",
      "  sudaca",
      "",
    ].join("\n");
    expect(parseBlocklist(text)).toEqual(new Set(["polla", "sudaca"]));
  });
});

describe("parseCuss", () => {
  it("reads each entry of cuss's es.js with its rating, quoted or not", () => {
    const text = [
      "/**",
      " * Map of Spanish profane words to a rating of sureness.",
      " *",
      " * @type {Record<string, number>}",
      " */",
      "export const cuss = {",
      "  abanto: 2,",
      "  afilar: 1,",
      "  'cara de pupu': 2,",
      "  aguayón: 2",
      "}",
    ].join("\n");
    expect(parseCuss(text)).toEqual(
      new Map([
        ["abanto", 2],
        ["afilar", 1],
        ["cara de pupu", 2],
        ["aguayón", 2],
      ]),
    );
  });
});

describe("parseLdnoobw", () => {
  it("reads the single words of the LDNOOBW list, in lower case", () => {
    const text = ["Asesinato", "asno", "Hacer una paja", "Cabrón", ""].join(
      "\n",
    );
    expect(parseLdnoobw(text)).toEqual(
      new Set(["asesinato", "asno", "cabrón"]),
    );
  });
});
