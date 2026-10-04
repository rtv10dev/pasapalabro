import { describe, expect, it } from "vitest";
import { citationsBySense } from "../../scripts/word-list/wikitext";

describe("citationsBySense", () => {
  it("reads the dictionaries each numbered sense cites", () => {
    const page = `== {{lengua|es}} ==
=== {{verbo transitivo|es}} ===
;1: Enredar o enmarañar una cosa.<ref name="drae">{{DRAE2001}}</ref>
{{sinónimo|complicar}}
;2: Confundir los pensamientos.<ref name="drae" />
;3 {{csem|juegos}}: Casilla del tablero.<ref>{{DLC1914|211}}</ref>
;4: Sin fuente.`;

    expect(citationsBySense(page)).toEqual(
      new Map([
        ["1", ["DRAE2001"]],
        ["2", ["DRAE2001"]],
        ["3", ["DLC1914"]],
        ["4", []],
      ]),
    );
  });

  it("resolves a named reference defined further down the page", () => {
    const page = `== {{lengua|es}} ==
;1: Corredor para tomar el sol.<ref name="nov" />
;2: El sitio donde el sol calienta más.<ref name="nov">{{Labernia1866}} Pág. 823</ref>`;

    expect(citationsBySense(page).get("1")).toEqual(["Labernia1866"]);
  });

  it("reads only the Spanish section", () => {
    const page = `== {{lengua|ast}} ==
;1: Otra cosa.<ref>{{DLE}}</ref>
== {{lengua|es}} ==
;1: Edificación destinada a vivienda.
== {{lengua|gl}} ==
;1: Casa.<ref>{{DRAE2001}}</ref>`;

    expect(citationsBySense(page)).toEqual(new Map([["1", []]]));
  });

  it("gives nothing for a page without Spanish", () => {
    expect(citationsBySense("== {{lengua|en}} ==\n;1: House.")).toEqual(
      new Map(),
    );
  });
});
