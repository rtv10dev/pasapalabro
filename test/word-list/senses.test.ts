import { describe, expect, it } from "vitest";
import {
  checkSense,
  isDerogatory,
  isOffensiveInSpain,
  pickClue,
  pickOtherAnswers,
  type Sense,
  type Synonym,
} from "../../scripts/word-list/senses";

function sense(gloss: string, extra: Partial<Sense> = {}): Sense {
  return { gloss, tags: [], sources: [], synonyms: [], ...extra };
}

function synonym(word: string, note = ""): Synonym {
  return { word, note };
}

describe("checkSense", () => {
  it("accepts an ordinary sense", () => {
    expect(
      checkSense("solana", sense("El sitio donde el sol calienta más.")),
    ).toBeNull();
  });

  it("refuses a sense with no text", () => {
    expect(checkSense("graduar", sense(""))).toBe("empty-clue");
  });

  it("refuses a sense that contains the Word, as the Clue checks do", () => {
    expect(checkSense("perro", sense("Cría de los perros del pastor."))).toBe(
      "answer-in-clue",
    );
  });

  it("refuses a sense with a word of the Word's family", () => {
    expect(checkSense("articulador", sense("Que articula."))).toBe("family");
    expect(checkSense("inclusión", sense("Acción o efecto de incluir."))).toBe(
      "family",
    );
    expect(checkSense("oligarca", sense("Miembro de una oligarquía."))).toBe(
      "family",
    );
  });

  it("refuses a sense with a word built on a short Word", () => {
    expect(checkSense("uva", sense("Racimo de uvas."))).toBe("family");
    expect(checkSense("iza", sense("Acción o efecto de izar."))).toBe("family");
    expect(checkSense("zoo", sense("Parque zoológico."))).toBe("family");
  });

  it("refuses a family word whose stem changes, e to ie or o to ue", () => {
    expect(checkSense("enmendador", sense("Que enmienda."))).toBe("family");
    expect(checkSense("acierto", sense("Acción de acertar."))).toBe("family");
    expect(checkSense("colgante", sense("Que cuelga."))).toBe("family");
  });

  it("refuses a short word the Word is built on", () => {
    expect(checkSense("sanador", sense("Que sana."))).toBe("family");
    expect(checkSense("asmático", sense("Que padece asma."))).toBe("family");
    expect(checkSense("cazador", sense("El que caza."))).toBe("family");
  });

  it("allows a common word the Word merely starts with", () => {
    expect(
      checkSense("comodín", sense("Carta que vale como cualquier otra.")),
    ).toBeNull();
    expect(
      checkSense("parabién", sense("Felicitación dirigida para alguien.")),
    ).toBeNull();
    expect(
      checkSense("estanco", sense("Tienda donde se venden sellos y está.")),
    ).toBeNull();
  });

  it("allows short words that merely look like the Word", () => {
    expect(
      checkSense("solana", sense("Donde da el sol en la casa.")),
    ).toBeNull();
  });

  it("refuses a Word that answers no letter of the Rosco", () => {
    expect(checkSense("kilo", sense("Mil gramos."))).toBe("letter-rule");
    expect(checkSense("kayak", sense("Canoa de remo."))).toBeNull();
  });

  it("refuses a cross-reference to another entry", () => {
    for (const gloss of [
      "Véase rabo.",
      "Variante de buhardilla.",
      "Variante anticuada de cosa.",
      "Grafía alternativa de quiosco.",
      "Diminutivo de casa.",
      "Sinónimo de bonito.",
      "Forma del femenino singular de cliente.",
      "(Ipomoea batatas) Variante de boniato.",
      "Forma acortada de parque zoológico.",
    ]) {
      expect(checkSense("palabra", sense(gloss)), gloss).toBe(
        "cross-reference",
      );
    }
    expect(
      checkSense("monarquía", sense("Forma de gobierno con un rey.")),
    ).toBeNull();
  });

  it("refuses a sense that leans on a neighbouring one", () => {
    for (const gloss of [
      "Por extensión del anterior, cualquier tabla para el cómputo.",
      "Semilla comestible del fruto anterior.",
      "Partidario de alguno de los anteriores.",
      "Madera de este árbol.",
      "Bulbo comestible de esta planta.",
      "Perteneciente o relativo a ese pueblo.",
      "Bebida alcohólica aderezada con esta planta.",
      "Sonido producido por dicho toque.",
    ]) {
      expect(checkSense("palabra", sense(gloss)), gloss).toBe(
        "cross-reference",
      );
    }
    for (const gloss of [
      "Día inmediatamente anterior al de hoy.",
      "Abertura anterior del tubo digestivo.",
      "Que puede volver al estado anterior.",
      "Dicho de una persona: que habla mucho.",
      "Viento que sopla del este.",
      "Pueblo situado al este de Madrid.",
      "Unir dos cosas de tal modo que esta no se suelte.",
    ]) {
      expect(checkSense("palabra", sense(gloss)), gloss).toBeNull();
    }
  });

  it("refuses an inflected form", () => {
    expect(
      checkSense("discreta", sense("De discreto.", { tags: ["form-of"] })),
    ).toBe("cross-reference");
  });

  it("refuses an old or rare sense", () => {
    for (const tag of ["outdated", "obsolete", "rare", "desuso"]) {
      expect(checkSense("estío", sense("Verano.", { tags: [tag] })), tag).toBe(
        "old-or-rare",
      );
    }
  });

  it("refuses a sense used only outside Spain", () => {
    expect(
      checkSense(
        "caliche",
        sense("Costra de arena del desierto de Atacama.", {
          tags: ["Bolivia", "Chile", "Peru"],
        }),
      ),
    ).toBe("not-spain");
    expect(
      checkSense("pibe", sense("Niño, chaval.", { tags: ["Lunfardo"] })),
    ).toBe("not-spain");
    expect(
      checkSense("pibe", sense("Niño, chaval.", { tags: ["lunfardismo"] })),
    ).toBe("not-spain");
  });

  it("accepts a sense used across Spain, wherever else it is used", () => {
    expect(
      checkSense(
        "pájaro",
        sense("Persona astuta.", { tags: ["Mexico", "Spain", "colloquial"] }),
      ),
    ).toBeNull();
  });

  it("refuses a sense used only in a region of Spain", () => {
    expect(
      checkSense(
        "gofio",
        sense("Harina de maíz tostado.", { tags: ["Canaries"] }),
      ),
    ).toBe("regional");
    expect(
      checkSense(
        "galeón",
        sense("Cámara para guardar el pan.", {
          tags: ["Andalusia", "Mexico"],
        }),
      ),
    ).toBe("regional");
  });

  it("refuses a vulgar or offensive sense", () => {
    for (const tag of ["vulgar", "malsonante", "ofensivo"]) {
      expect(
        checkSense("palabro", sense("Algo feo.", { tags: [tag] })),
        tag,
      ).toBe("vulgar");
    }
  });

  it("refuses a sense labelled offensive in free text", () => {
    for (const tag of [
      "se usa como insulto",
      "sexista",
      "de origen ofensivo",
    ]) {
      expect(
        checkSense("palabro", sense("Algo feo.", { tags: [tag] })),
        tag,
      ).toBe("vulgar");
    }
  });

  it("keeps a sense labelled vulgar only in some contexts", () => {
    expect(
      checkSense(
        "sobaco",
        sense("Concavidad que forma el brazo con el hombro.", {
          tags: ["en ciertos contextos se considera vulgar"],
        }),
      ),
    ).toBeNull();
  });

  it("keeps a sense labelled a nonstandard form", () => {
    expect(
      checkSense("palabro", sense("Algo feo.", { tags: ["vulgarismo"] })),
    ).toBeNull();
  });

  it("keeps a merely derogatory or colloquial sense", () => {
    for (const tags of [
      ["derogatory", "colloquial"],
      ["es despectivo"],
      ["peyorativo"],
    ]) {
      expect(
        checkSense(
          "casucha",
          sense("Casa pequeña y mal construida.", { tags }),
        ),
        tags[0],
      ).toBeNull();
    }
  });

  it("refuses a sense that cites a modern RAE dictionary", () => {
    for (const source of [
      "DRAE2001",
      "DRAE1992",
      "DLE",
      "Damer",
      "DPD",
      "DEJ",
      "DHLE",
    ]) {
      expect(
        checkSense(
          "intrincar",
          sense("Enredar o enmarañar una cosa.", { sources: [source] }),
        ),
        source,
      ).toBe("rae-source");
    }
  });

  it("accepts a sense that cites a public-domain edition", () => {
    for (const source of ["DLE1925", "DLC1914", "Labernia1866"]) {
      expect(
        checkSense(
          "porfiar",
          sense("Disputar con tenacidad.", { sources: [source] }),
        ),
        source,
      ).toBeNull();
    }
  });

  it("refuses the name of a letter, which the Rosco shows", () => {
    expect(checkSense("eñe", sense("Nombre de la letra ñ."))).toBe(
      "letter-name",
    );
    expect(checkSense("efe", sense("Nombre de la letra f"))).toBe(
      "letter-name",
    );
    expect(
      checkSense(
        "ele",
        sense("Nombre de la letra L (duodécima letra del alfabeto)."),
      ),
    ).toBe("letter-name");
  });

  it("accepts a Greek letter's name, which isn't given away", () => {
    expect(
      checkSense(
        "lambda",
        sense("Nombre de la letra λ, undécima del alfabeto griego."),
      ),
    ).toBeNull();
    expect(
      checkSense("beta", sense("Segunda letra del alfabeto griego.")),
    ).toBeNull();
  });

  it("refuses a one-word sense, a bare synonym rather than a definition", () => {
    expect(checkSense("señorear", sense("Dominar."))).toBe("too-short");
    expect(checkSense("ajiaceite", sense("Ajoaceite"))).toBe("too-short");
    expect(checkSense("señorear", sense("Mandar como dueño."))).toBeNull();
  });

  it("refuses a sense over 30 words", () => {
    const words = (count: number) => Array(count).fill("algo").join(" ");

    expect(checkSense("hule", sense(words(30)))).toBeNull();
    expect(checkSense("hule", sense(words(31)))).toBe("too-long");
  });
});

describe("pickClue", () => {
  it("takes the first sense that passes, cleaned up", () => {
    expect(
      pickClue("caliche", [
        sense("Costra de arena de Atacama.", { tags: ["Chile"] }),
        sense("  En la alfarería,   piedrecita  incrustada en la vasija. "),
        sense("Costra de cal que se levanta de una pared."),
      ]),
    ).toBe("En la alfarería, piedrecita incrustada en la vasija.");
  });

  it("skips a regional sense for one known across Spain", () => {
    expect(
      pickClue("galeón", [
        sense("Cámara para guardar el pan.", { tags: ["Andalusia"] }),
        sense("Barco grande de vela.", { tags: ["Spain", "Mexico"] }),
        sense("Barco de guerra."),
      ]),
    ).toBe("Barco grande de vela.");
  });

  it("gives nothing when only regional senses would pass", () => {
    expect(
      pickClue("gofio", [
        sense("Harina tostada.", { tags: ["Canaries"] }),
        sense("Harina de maíz.", { tags: ["Mexico"] }),
      ]),
    ).toBeNull();
  });

  it("drops the sense-number subscripts of a gloss", () => {
    expect(pickClue("añublar", [sense("Nublar₁ el cielo.")])).toBe(
      "Nublar el cielo.",
    );
  });

  it("drops the editors' notes and wiki markup left in a gloss", () => {
    expect(
      pickClue("estibina", [
        sense("Mineral de color gris.^([cita requerida])"),
      ]),
    ).toBe("Mineral de color gris.");
    expect(
      pickClue("mendaz", [sense("Que miente. ^([definición imprecisa]).")]),
    ).toBe("Que miente.");
    expect(
      pickClue("temor", [sense("Pasión del ánimo. :*Sinónimo: miedo..")]),
    ).toBe("Pasión del ánimo.");
    expect(
      pickClue("conducir", [
        sense("Llevar [algo o a alguien] de una parte a otra."),
      ]),
    ).toBe("Llevar algo o a alguien de una parte a otra.");
    expect(pickClue("acceso", [sense("Acción de llegar o entrar..")])).toBe(
      "Acción de llegar o entrar.",
    );
  });

  it("passes over a one-word sense for its next sense", () => {
    expect(
      pickClue("señorear", [
        sense("Dominar."),
        sense("Mandar uno en algo como dueño."),
      ]),
    ).toBe("Mandar uno en algo como dueño.");
  });

  it("passes over a letter's name for its next sense", () => {
    expect(
      pickClue("jota", [
        sense("Nombre de la letra j."),
        sense("Baile popular de Aragón."),
      ]),
    ).toBe("Baile popular de Aragón.");
  });

  it("gives nothing when no sense passes", () => {
    expect(pickClue("estío", [sense("Verano.", { tags: ["outdated"] })])).toBe(
      null,
    );
    expect(pickClue("graduar", [])).toBeNull();
  });
});

describe("pickOtherAnswers", () => {
  /** Words of the Word List, as the build passes them. */
  const WORDS = new Set([
    "bello",
    "bueno",
    "bárbaro",
    "hermoso",
    "lindo",
    "precioso",
    "coyunda",
    "atadura",
    "muñeca",
    "monigote",
    "pañuelo",
    "cuerda",
  ]);

  it("takes the synonyms of the sense that is the Clue", () => {
    expect(
      pickOtherAnswers(
        "bonito",
        [
          sense("Lindo antiguo.", {
            tags: ["outdated"],
            synonyms: [synonym("lindo")],
          }),
          sense("Agradable a la vista.", { synonyms: [synonym("bello")] }),
          sense("Pez parecido al atún.", { synonyms: [synonym("barrilete")] }),
        ],
        WORDS,
      ),
    ).toEqual(["bello"]);
  });

  it("keeps only synonyms that are Words themselves", () => {
    expect(
      pickOtherAnswers(
        "bonito",
        [
          sense("Agradable a la vista.", {
            synonyms: [synonym("bellísimo"), synonym("bello")],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["bello"]);
  });

  it("keeps only synonyms that start with the Word's letter", () => {
    expect(
      pickOtherAnswers(
        "bonito",
        [
          sense("Agradable a la vista.", {
            synonyms: [synonym("hermoso"), synonym("bello")],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["bello"]);
  });

  it("keeps only synonyms that contain Ñ, X or Y when the Word does", () => {
    expect(
      pickOtherAnswers(
        "yugo",
        [
          sense("Instrumento que une a dos bueyes.", {
            synonyms: [synonym("atadura"), synonym("coyunda")],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["coyunda"]);
  });

  it("keeps only synonyms that answer every letter the Word answers", () => {
    expect(
      pickOtherAnswers(
        "muñeco",
        [
          sense("Figurilla de persona.", {
            synonyms: [
              synonym("monigote"),
              synonym("pañuelo"),
              synonym("muñeca"),
            ],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["muñeca"]);
  });

  it("drops synonyms that fail the Clue checks", () => {
    expect(
      pickOtherAnswers(
        "cordel",
        [
          sense("Cuerda delgada.", {
            synonyms: [
              synonym("cuerda"),
              synonym("cuerda fina"),
              synonym("cordel"),
              synonym("coyunda"),
              synonym("Coyunda"),
            ],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["coyunda"]);
  });

  it("drops synonyms noted as offensive, old or rare, or not of all of Spain", () => {
    for (const note of [
      "malsonante",
      "Argentina, Chile; malsonante",
      "vulgar",
      "anticuado",
      "anticuado o literario",
      "hoy desusado",
      "en desuso",
      "obsoleto, salvo en Derecho",
      "poco usado",
      "poco frecuente",
      "Chile",
      "sur de Chile",
      "Bolivia y Uruguay",
      "Andalucía",
      "Venezuela, coloquial",
      "rioplatense",
      "andino",
      "lunfardo",
      "algunos países latinoamericanos",
    ]) {
      expect(
        pickOtherAnswers(
          "bonito",
          [
            sense("Agradable a la vista.", {
              synonyms: [synonym("bello", note)],
            }),
          ],
          WORDS,
        ),
        note,
      ).toEqual([]);
    }
  });

  it("keeps synonyms used across Spain, wherever else, or merely colloquial", () => {
    for (const note of [
      "España",
      "Argentina, España",
      "Murcia, España",
      "coloquial",
      "literario",
      "despectivo",
    ]) {
      expect(
        pickOtherAnswers(
          "bonito",
          [
            sense("Agradable a la vista.", {
              synonyms: [synonym("bello", note)],
            }),
          ],
          WORDS,
        ),
        note,
      ).toEqual(["bello"]);
    }
  });

  it("keeps at most two", () => {
    expect(
      pickOtherAnswers(
        "bonito",
        [
          sense("Agradable a la vista.", {
            synonyms: [synonym("bello"), synonym("bueno"), synonym("bárbaro")],
          }),
        ],
        WORDS,
      ),
    ).toEqual(["bello", "bueno"]);
  });

  it("gives none when no sense passes", () => {
    expect(
      pickOtherAnswers(
        "bonito",
        [sense("Bello.", { tags: ["outdated"], synonyms: [synonym("bello")] })],
        WORDS,
      ),
    ).toEqual([]);
  });
});

describe("isOffensiveInSpain", () => {
  it("finds a sense labelled vulgar or offensive", () => {
    for (const tag of [
      "vulgar",
      "malsonante",
      "ofensivo",
      "obsceno",
      "se usa como insulto",
      "de origen ofensivo",
      "sexista",
    ]) {
      expect(isOffensiveInSpain(sense("Pene.", { tags: [tag] })), tag).toBe(
        true,
      );
    }
  });

  it("finds one used in Spain or a region of it, wherever else it is used", () => {
    expect(
      isOffensiveInSpain(
        sense("Pene.", { tags: ["Spain", "Mexico", "vulgar"] }),
      ),
    ).toBe(true);
    expect(
      isOffensiveInSpain(sense("Pene.", { tags: ["Andalusia", "vulgar"] })),
    ).toBe(true);
  });

  it("passes a sense vulgar only outside Spain", () => {
    expect(
      isOffensiveInSpain(
        sense("Realizar el acto sexual.", { tags: ["Argentina", "vulgar"] }),
      ),
    ).toBe(false);
  });

  it("passes a nonstandard form, a derogatory sense and an ordinary one", () => {
    for (const tags of [["vulgarismo"], ["derogatory"], []]) {
      expect(isOffensiveInSpain(sense("Bajar.", { tags })), tags[0]).toBe(
        false,
      );
    }
  });
});

describe("isDerogatory", () => {
  it("finds a sense labelled derogatory", () => {
    for (const tag of [
      "derogatory",
      "con frecuencia despectivo",
      "coloquial, peyorativo",
      "derogativo",
    ]) {
      expect(
        isDerogatory(sense("Hombre homosexual.", { tags: [tag] })),
        tag,
      ).toBe(true);
    }
  });

  it("passes an ordinary or merely colloquial sense", () => {
    expect(isDerogatory(sense("Perro.", { tags: ["colloquial"] }))).toBe(false);
  });
});
