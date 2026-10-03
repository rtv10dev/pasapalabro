import { describe, expect, it } from "vitest";
import {
  generateRosco,
  ProviderUnavailable,
  type ClueRequest,
  type Provider,
} from "../../src/clues/generate";
import { promptFor } from "../../src/clues/prompt";
import { LETTERS, type Letter, type Rosco } from "../../src/shared/rosco";
import { modelClue, modelReply } from "../fixtures/clues";

/** A model that writes a valid Clue for every letter it is asked for. */
function goodModel(request: ClueRequest): string {
  return modelReply(request.letters.map((letter) => modelClue(letter)));
}

/** A provider that answers each request with the next reply in the list. */
function scripted(
  name: string,
  replies: ((request: ClueRequest) => string)[],
): Provider & { requests: ClueRequest[] } {
  const requests: ClueRequest[] = [];
  return {
    name,
    requests,
    async write(request) {
      await Promise.resolve();
      requests.push(request);
      const reply = replies.shift();
      if (!reply) throw new Error(`${name} got an unexpected request`);
      return reply(request);
    },
  };
}

/** A model that gets the given letters wrong: their answer breaks the letter rule. */
function missing(...wrong: Letter[]) {
  return (request: ClueRequest): string =>
    modelReply(
      request.letters.map((letter) =>
        wrong.includes(letter) ? modelClue(letter, "zzz") : modelClue(letter),
      ),
    );
}

/** A model that writes these other answers for the letter's Clue, and none for the rest. */
function replyWithOtherAnswers(letter: Letter, otherAnswers: unknown) {
  return (request: ClueRequest): string =>
    modelReply(
      request.letters.map((each) =>
        each === letter
          ? { ...modelClue(each), otherAnswers }
          : modelClue(each),
      ),
    );
}

/** The other answers of the Rosco's Clue for the letter. */
function otherAnswersOf(rosco: Rosco, letter: Letter): string[] | undefined {
  return rosco.find((clue) => clue.letter === letter)?.otherAnswers;
}

/** A provider overloaded or too slow to answer, like Gemini's 503 "high demand". */
function unavailable(): never {
  throw new ProviderUnavailable("503 high demand");
}

/** A provider that refuses the request for good, like a 400 for a bad key. */
function broken(): never {
  throw new Error("400 API key not valid");
}

const noSleep = (): Promise<void> => Promise.resolve();

function generate(
  providers: Provider[],
  sleep: (ms: number) => Promise<void> = noSleep,
) {
  return generateRosco("normal", { providers, random: () => 0.5, sleep });
}

describe("generateRosco", () => {
  it("makes a Rosco with one Clue per letter, two of them very hard", async () => {
    const gemini = scripted("gemini", [goodModel]);

    const rosco = await generateRosco("normal", {
      providers: [gemini],
      random: () => 0.5,
      sleep: noSleep,
    });

    expect(rosco.map((clue) => clue.letter)).toEqual(LETTERS);
    expect(rosco[1]).toEqual({
      letter: "B",
      contains: false,
      text: "Definición número 1",
      answer: "ballena",
      // The model wrote no other answers: the field is optional.
      otherAnswers: [],
      veryHard: false,
    });
    expect(rosco.find((clue) => clue.letter === "X")?.contains).toBe(true);
    const veryHard = rosco.filter((clue) => clue.veryHard);
    expect(veryHard).toHaveLength(2);
    expect(gemini.requests[0]).toMatchObject({
      difficulty: "normal",
      letters: LETTERS,
      veryHard: veryHard.map((clue) => clue.letter),
      avoid: [],
    });
  });

  it("keeps the other answers a model writes for a Clue", async () => {
    const gemini = scripted("gemini", [
      replyWithOtherAnswers("B", ["bisonte", "búfalo"]),
    ]);

    const rosco = await generate([gemini]);

    expect(otherAnswersOf(rosco, "B")).toEqual(["bisonte", "búfalo"]);
  });

  it("drops quietly the other answers that fail a check, in the same round", async () => {
    const gemini = scripted("gemini", [
      replyWithOtherAnswers("N", [
        "zanahoria", // Breaks the letter rule.
        "número", // In the Clue: "Definición número 12".
        "nave espacial", // Not one word.
        " Nutria ", // The main answer again.
        "nube",
      ]),
    ]);

    const rosco = await generate([gemini]);

    expect(otherAnswersOf(rosco, "N")).toEqual(["nube"]);
    expect(gemini.requests).toHaveLength(1);
  });

  it("keeps no more than two other answers, the first valid ones", async () => {
    const gemini = scripted("gemini", [
      replyWithOtherAnswers("B", ["zzz", "bisonte", "búfalo", "burro"]),
    ]);

    const rosco = await generate([gemini]);

    expect(otherAnswersOf(rosco, "B")).toEqual(["bisonte", "búfalo"]);
  });

  it("ignores other answers that aren't a list of words, in the same round", async () => {
    const gemini = scripted("gemini", [replyWithOtherAnswers("B", "bisonte")]);

    const rosco = await generate([gemini]);

    expect(otherAnswersOf(rosco, "B")).toEqual([]);
    expect(gemini.requests).toHaveLength(1);
  });

  it("asks again only for the letters whose Clue failed a check", async () => {
    const gemini = scripted("gemini", [missing("B", "Ñ"), goodModel]);

    const rosco = await generate([gemini]);

    expect(rosco.find((clue) => clue.letter === "B")?.answer).toBe("ballena");
    expect(gemini.requests[1]?.letters).toEqual(["B", "Ñ"]);
    expect(gemini.requests[1]?.avoid).toHaveLength(23);
    expect(gemini.requests[1]?.avoid).toContain("abeja");
  });

  it("avoids the answers it is given, on top of those already in the Rosco", async () => {
    // The Match's other Rosco has "abeja" and "Ballena"; this model uses
    // "abeja" anyway the first time.
    const fresh = { A: "avispa", B: "búho" } as const;
    const gemini = scripted("gemini", [
      goodModel,
      (request) =>
        modelReply(
          request.letters.map((letter) =>
            modelClue(letter, letter === "A" ? fresh.A : fresh.B),
          ),
        ),
    ]);

    const rosco = await generateRosco(
      "normal",
      { providers: [gemini], random: () => 0.5, sleep: noSleep },
      ["abeja", "Ballena"],
    );

    expect(gemini.requests[0]?.avoid).toEqual(["abeja", "Ballena"]);
    expect(promptFor(gemini.requests[0]!).user).toContain(
      "No uses ninguna de estas respuestas: abeja, Ballena.",
    );
    // Both answers were refused as repeated, so their letters are asked again.
    expect(gemini.requests[1]?.letters).toEqual(["A", "B"]);
    expect(gemini.requests[1]?.avoid).toEqual(
      expect.arrayContaining(["abeja", "Ballena", "caracol"]),
    );
    expect(gemini.requests[1]?.avoid).toHaveLength(25);
    expect(rosco.slice(0, 2).map((clue) => clue.answer)).toEqual([
      fresh.A,
      fresh.B,
    ]);
  });

  it("gives up after three rounds with a Clue still failing", async () => {
    const gemini = scripted("gemini", [
      missing("B"),
      missing("B"),
      missing("B"),
      goodModel,
    ]);

    await expect(generate([gemini])).rejects.toThrow();
    expect(gemini.requests).toHaveLength(3);
  });

  it("counts a reply that isn't valid JSON as a round with every Clue failed", async () => {
    const gemini = scripted("gemini", [() => "Lo siento, no puedo", goodModel]);

    const rosco = await generate([gemini]);

    expect(rosco).toHaveLength(LETTERS.length);
    expect(gemini.requests[1]?.letters).toEqual(LETTERS);
  });

  it("retries a provider that is unavailable, waiting longer each time, without using up a round", async () => {
    const gemini = scripted("gemini", [
      unavailable,
      unavailable,
      missing("B"),
      unavailable,
      missing("B"),
      goodModel,
    ]);
    const waits: number[] = [];

    const rosco = await generate([gemini], (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });

    expect(rosco).toHaveLength(LETTERS.length);
    expect(waits).toHaveLength(3);
    expect(waits[1]).toBeGreaterThan(waits[0]!);
  });

  it("falls back to the next provider when the first one stays unavailable", async () => {
    const gemini = scripted(
      "gemini",
      Array.from({ length: 10 }, () => unavailable),
    );
    const gptOss = scripted("gpt-oss", [goodModel]);

    const rosco = await generate([gemini, gptOss]);

    expect(rosco).toHaveLength(LETTERS.length);
    expect(gptOss.requests).toHaveLength(1);
  });

  it("falls back to the next provider at once when the first one refuses", async () => {
    const gemini = scripted("gemini", [broken]);
    const gptOss = scripted("gpt-oss", [goodModel]);
    const waits: number[] = [];

    await generate([gemini, gptOss], (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });

    expect(waits).toEqual([]);
    expect(gemini.requests).toHaveLength(1);
    expect(gptOss.requests).toHaveLength(1);
  });

  it("fails when every provider fails", async () => {
    const gemini = scripted(
      "gemini",
      Array.from({ length: 10 }, () => unavailable),
    );
    const gptOss = scripted("gpt-oss", [broken]);

    await expect(generate([gemini, gptOss])).rejects.toThrow();
  });
});
