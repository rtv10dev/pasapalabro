import { DurableObject } from "cloudflare:workers";
import { DIFFICULTIES, type Difficulty } from "../shared/protocol";
import type { Rosco } from "../shared/rosco";

/** How many Roscos of each Difficulty the Stock keeps: enough for two Matches. */
const ROSCOS_PER_DIFFICULTY = 4;

/** The one Stock, shared by every Match. */
export function stockOf(env: Env): DurableObjectStub<Stock> {
  return env.STOCK.getByName("stock");
}

/**
 * The Stock: the Roscos generated ahead of time, by Difficulty (ADR 0004).
 * Only storage: the Cron Trigger generates the Roscos and adds them here.
 * One Durable Object for all Matches, so no two Matches take the same Rosco.
 */
export class Stock extends DurableObject<Env> {
  /** Removes and returns up to `count` Roscos of the Difficulty, oldest first. */
  take(difficulty: Difficulty, count: number): Rosco[] {
    const roscos = this.load(difficulty);
    this.save(difficulty, roscos.slice(count));
    return roscos.slice(0, count);
  }

  add(difficulty: Difficulty, rosco: Rosco): void {
    this.save(difficulty, [...this.load(difficulty), rosco]);
  }

  /** The Difficulty with the fewest Roscos, if any has fewer than it should. */
  neediest(): Difficulty | null {
    let neediest: Difficulty | null = null;
    let fewest = ROSCOS_PER_DIFFICULTY;
    for (const difficulty of DIFFICULTIES) {
      const count = this.load(difficulty).length;
      if (count < fewest) {
        neediest = difficulty;
        fewest = count;
      }
    }
    return neediest;
  }

  private load(difficulty: Difficulty): Rosco[] {
    // Only this class writes these keys, always with a Rosco[].
    return this.ctx.storage.kv.get<Rosco[]>(difficulty) ?? [];
  }

  private save(difficulty: Difficulty, roscos: Rosco[]): void {
    this.ctx.storage.kv.put(difficulty, roscos);
  }
}
