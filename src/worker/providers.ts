import * as z from "zod/mini";
import {
  ProviderUnavailable,
  type Generation,
  type Provider,
} from "../clues/generate";
import { promptFor, REPLY_SCHEMA } from "../clues/prompt";

const GEMINI_MODEL = "gemini-3.8-flash";
const GPT_OSS_MODEL = "@cf/openai/gpt-oss-120b";

/** How long a model may take before its request is retried. gpt-oss-120b once took 52 s. */
const GEMINI_TIMEOUT_MS = 60_000;
const GPT_OSS_TIMEOUT_MS = 120_000;

/** HTTP statuses that mean "not now" rather than "never". */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** What generating a Rosco on Cloudflare uses: Gemini first, gpt-oss-120b as fallback (ADR 0004). */
export function generation(env: Env): Generation {
  return {
    providers: [gemini(env.GEMINI_API_KEY), gptOss(env.AI)],
    random: Math.random,
    sleep: (ms) => scheduler.wait(ms),
  };
}

const geminiReplySchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.optional(z.string()) })),
      }),
    }),
  ),
});

function gemini(apiKey: string): Provider {
  return {
    name: GEMINI_MODEL,
    async write(request) {
      const { system, user } = promptFor(request);
      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: REPLY_SCHEMA,
              },
            }),
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          },
        );
      } catch (error) {
        // A timeout or a dropped connection: worth another try.
        throw new ProviderUnavailable(`Gemini: ${String(error)}`);
      }
      if (!response.ok) {
        const message = `Gemini ${response.status}: ${await response.text()}`;
        if (RETRYABLE_STATUSES.has(response.status)) {
          throw new ProviderUnavailable(message);
        }
        throw new Error(message);
      }
      const reply = geminiReplySchema.safeParse(await response.json());
      if (!reply.success) return "";
      const parts = reply.data.candidates[0]?.content.parts ?? [];
      return parts.map((part) => part.text ?? "").join("");
    },
  };
}

/** gpt-oss-120b answers either as Chat Completions or as Responses. */
const gptOssReplySchema = z.union([
  z.object({
    choices: z.array(
      z.object({ message: z.object({ content: z.nullish(z.string()) }) }),
    ),
  }),
  z.object({ output_text: z.string() }),
]);

/** Errors Workers AI gives when it is busy or slow rather than broken. */
const WORKERS_AI_BUSY =
  /capacity|overloaded|temporarily|rate limit|timeout|timed out|abort|\b(429|5\d\d)\b/i;

function gptOss(ai: Ai): Provider {
  return {
    name: GPT_OSS_MODEL,
    async write(request) {
      const { system, user } = promptFor(request);
      let result: unknown;
      try {
        result = await ai.run(
          GPT_OSS_MODEL,
          {
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            // Its reasoning counts against this too.
            max_tokens: 8000,
          },
          { signal: AbortSignal.timeout(GPT_OSS_TIMEOUT_MS) },
        );
      } catch (error) {
        const message = `gpt-oss-120b: ${String(error)}`;
        if (WORKERS_AI_BUSY.test(message)) {
          throw new ProviderUnavailable(message);
        }
        throw new Error(message, { cause: error });
      }
      const reply = gptOssReplySchema.safeParse(result);
      if (!reply.success) return "";
      return "choices" in reply.data
        ? (reply.data.choices[0]?.message.content ?? "")
        : reply.data.output_text;
    },
  };
}
