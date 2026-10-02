import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker";
import { stockOf } from "../../src/worker/stock";
import type { MatchView } from "../../src/shared/protocol";
import { GOOD_REPLY } from "../fixtures/clues";
import {
  connectDevice,
  createMatchAsIs,
  join,
  newDeviceKey,
  nextStateWhere,
  postMatch,
  UNHOSTED,
  type Device,
} from "./helpers";

const GEMINI = "https://generativelanguage.googleapis.com/";

/** Gemini, faked: answers every request with a valid Rosco, once let through. */
let geminiRequests: number;
let letGeminiAnswer: () => void;

beforeEach(async () => {
  geminiRequests = 0;
  let answering = Promise.resolve();
  letGeminiAnswer = () => undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(GEMINI)) throw new Error(`Unexpected fetch: ${url}`);
    geminiRequests++;
    await answering;
    return Response.json({
      candidates: [{ content: { parts: [{ text: GOOD_REPLY }] } }],
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
});
