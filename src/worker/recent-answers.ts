import { DurableObject } from "cloudflare:workers";
import { drawRoscos } from "../clues/draw";
import { remember, type AnswersByRosco } from "../clues/recent";
import type { MatchRoscos } from "../rules/match";
import { DIFFICULTIES, type Difficulty } from "../shared/protocol";
import type { Rosco } from "../shared/rosco";
import { WORDS } from "./word-list";

/** The name of the one RecentAnswers object: still the Stock's, so it keeps its storage. */
const INSTANCE_NAME = "stock";

/**
 * Draws a new Match's two Roscos, avoiding the Recent Answers of its
 * Difficulty, which then remember them.
 */
export async function drawAvoidingRecentAnswers(
  env: Env,
  difficulty: Difficulty,
): Promise<MatchRoscos> {
  const recentAnswers = env.RECENT_ANSWERS.getByName(INSTANCE_NAME);
  const { first, second } = await recentAnswers.draw(difficulty);
  return [first, second];
}

/**
 * The one Durable Object shared by every Match: keeps the Recent Answers
 * of each Difficulty, and draws every Match's Roscos so they avoid them.
 * It was the Stock of Roscos generated ahead of time (ADR 0004).
 */
export class RecentAnswers extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The Roscos the Stock kept, under each Difficulty's name.
    for (const difficulty of DIFFICULTIES) ctx.storage.kv.delete(difficulty);
  }

  /**
   * Draws a Match's two Roscos, avoiding the Recent Answers of its
   * Difficulty, and remembers their answers. Calls run one at a time, so
   * Matches created together avoid each other's answers too.
   */
  draw(difficulty: Difficulty): { first: Rosco; second: Rosco } {
    const key = `recent:${difficulty}`;
    const recent = this.ctx.storage.kv.get<AnswersByRosco>(key) ?? [];
    const roscos = drawRoscos(WORDS, difficulty, recent.flat(), Math.random);
    this.ctx.storage.kv.put(key, remember(recent, roscos));
    // An object, not a tuple: RPC would type a tuple as any array.
    const [first, second] = roscos;
    return { first, second };
  }
}
