import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { stockOf } from "../../src/worker/stock";
import type { MatchView } from "../../src/shared/protocol";
import { LETTERS } from "../../src/shared/rosco";
import { modelClue, modelReply } from "../fixtures/clues";
import {
  connectDevice,
  createMatchAsIs,
  join,
  newDeviceKey,
  nextStateWhere,
  postMatch,
  rosco,
  ROSCOS,
  UNHOSTED,
  type Device,
} from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/";

/**
 * Gemini, faked: answers every request with a valid Rosco, once let through.
 * Like a real model it writes new answers each time, unless `repeating`;
 * either way it never uses the answers the prompt tells it to avoid.
 */
let geminiRequests: number;
/** The answers each request told Gemini to avoid, in order. */
let avoided: string[][];
let repeating: boolean;
let letGeminiAnswer: () => void;

/** A valid answer for every letter: the fixture's, plus `variant` "s"s. */
function replyWith(avoid: string[], variant: number): string {
  return modelReply(
    LETTERS.map((letter) => {
      const base = modelClue(letter).answer;
      let answer = base + "s".repeat(variant);
      for (let more = variant + 1; avoid.includes(answer); more++) {
        answer = base + "s".repeat(more);
      }
      return modelClue(letter, answer);
    }),
  );
}

/** The answers the prompt in a request body tells the model not to use. */
function avoidIn(body: unknown): string[] {
  const line = /No uses ninguna de estas respuestas: ([^"]*)\./.exec(
    typeof body === "string" ? body : "",
  );
  return line?.[1]?.split(", ") ?? [];
}

beforeEach(async () => {
  geminiRequests = 0;
  avoided = [];
  repeating = false;
  let answering = Promise.resolve();
  letGeminiAnswer = () => undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(GEMINI)) throw new Error(`Unexpected fetch: ${url}`);
    const avoid = avoidIn(init?.body);
    avoided.push(avoid);
    const variant = repeating ? 0 : geminiRequests;
    geminiRequests++;
    await answering;
    return Response.json({
      candidates: [
        { content: { parts: [{ text: replyWith(avoid, variant) }] } },
      ],
    });
  });
  // Each test starts with an empty Stock.
  const stock = stockOf(env);
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    await stock.take(difficulty, 100);
  }
  /** Holds Gemini's answers until the test calls letGeminiAnswer. */
  holdGemini = () => {
    answering = new Promise((resolve) => {
      letGeminiAnswer = resolve;
    });
  };
});

let holdGemini: () => void;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs the Cron Trigger once, as Cloudflare would. */
async function runCron(): Promise<void> {
  await worker.scheduled(
    createScheduledController({ cron: "*/5 * * * *" }),
    env,
  );
}

/**
 * Creates a Match with the Stock as it is, has Ana and Bea join as Players
 * and Ana press Empezar; returns Bea's Device and the first view she gets
 * of the started Match.
 */
async function startMatch(): Promise<{
  bea: Device;
  view: MatchView & { phase: "started" };
}> {
  const { id, creator } = await createMatchAsIs(UNHOSTED);
  const ana = await connectDevice(id, creator);
  const { you: anaId } = await ana.nextState();
  const bea = await join(id, "Bea");
  ana.send({ type: "assign", role: "player1", member: anaId });
  ana.send({ type: "assign", role: "player2", member: bea.id });
  ana.send({ type: "start" });
  const view = await nextStateWhere(
    bea.device,
    (each) => each.phase === "started",
  );
  if (view.phase !== "started") throw new Error("Not started");
  return { bea: bea.device, view };
}

describe("the Stock", () => {
  it("is filled by the Cron Trigger, so a new Match has its Roscos at once", async () => {
    // One Rosco per run, for the emptiest Difficulty: Fácil, Normal, Difícil, Fácil, Normal.
    for (let run = 0; run < 5; run++) await runCron();
    holdGemini();

    const { view } = await startMatch();

    expect(view.roscosReady).toBe(true);
    expect(geminiRequests).toBe(5);
  });

  it("keeps its Roscos when a Match can't be created", async () => {
    for (let run = 0; run < 5; run++) await runCron();
    holdGemini();

    const refused = await postMatch({
      settings: UNHOSTED,
      creator: { name: "  ", device: newDeviceKey() },
    });
    const { view } = await startMatch();

    expect(refused.status).toBe(400);
    expect(view.roscosReady).toBe(true);
  });

  it("never hands out two Roscos that share an answer, and keeps the one it skips", async () => {
    const stock = stockOf(env);
    // Shares "gato" with Player 1's Rosco, in another case.
    const clashing = rosco((answer) =>
      answer === "gato" ? "GATO" : `más${answer}`,
    );
    await stock.add("normal", ROSCOS.player1);
    await stock.add("normal", clashing);
    await stock.add("normal", ROSCOS.player2);

    expect(await stock.take("normal", 2)).toEqual([
      ROSCOS.player1,
      ROSCOS.player2,
    ]);
    expect(await stock.take("normal", 2)).toEqual([clashing]);
  });

  it("stops asking for Roscos once every Difficulty has enough", async () => {
    for (let run = 0; run < 20; run++) await runCron();
    const asked = geminiRequests;

    await runCron();

    expect(geminiRequests).toBe(asked);
    expect(asked).toBeLessThan(20);
  });
});

describe("a Match the Stock has no Roscos for", () => {
  it("shows them loading after Empezar until they are generated", async () => {
    holdGemini();
    const { bea, view } = await startMatch();

    expect(view.roscosReady).toBe(false);

    letGeminiAnswer();

    const ready = await nextStateWhere(
      bea,
      (each) => each.phase === "started" && each.roscosReady,
    );
    expect(ready.phase).toBe("started");
    expect(geminiRequests).toBe(2);
  });

  it("has the second Rosco avoid the first one's answers when the Stock had only one", async () => {
    await stockOf(env).add("normal", ROSCOS.player1);
    // Gemini would write Player 1's answers again if not told to avoid them.
    repeating = true;

    const { bea, view } = await startMatch();
    const ready = view.roscosReady
      ? view
      : await nextStateWhere(
          bea,
          (each) => each.phase === "started" && each.roscosReady,
        );

    expect(ready.phase).toBe("started");
    expect(geminiRequests).toBe(1);
    expect(avoided[0]).toEqual(ROSCOS.player1.map(({ answer }) => answer));
  });

  it("replaces a Rosco generated alongside the other with the same answers", async () => {
    repeating = true;
    holdGemini();
    const { bea } = await startMatch();

    letGeminiAnswer();

    await nextStateWhere(
      bea,
      (each) => each.phase === "started" && each.roscosReady,
    );
    expect(geminiRequests).toBe(3);
    expect(avoided.slice(0, 2)).toEqual([[], []]);
    expect(avoided[2]).toEqual(
      LETTERS.map((letter) => modelClue(letter).answer),
    );
  });
});
