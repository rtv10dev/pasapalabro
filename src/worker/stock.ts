import { DurableObject } from "cloudflare:workers";

/**
 * The one Durable Object shared by every Match. It was the Stock of Roscos
 * generated ahead of time (ADR 0004), which nothing reads since Matches draw
 * their Roscos from the Word List (ADR 0005); it stays so deployments that
 * have it keep working, and will keep the Recent Answers. Its storage may
 * still hold the old Roscos, under each Difficulty's name.
 */
export class Stock extends DurableObject<Env> {}
