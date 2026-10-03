import type { Difficulty } from "../shared/protocol";
import { MAX_OTHER_ANSWERS, type ClueRequest } from "./generate";

/** What a model reads: its standing instructions and this request. */
export interface Prompt {
  system: string;
  user: string;
}

const DIFFICULTY_WORDS: Record<Difficulty, string> = {
  easy: "Palabras muy comunes que conoce cualquier adulto: animales, objetos de casa, comida, verbos frecuentes.",
  normal:
    "Palabras de cultura general, como en el programa de televisión un día normal.",
  hard: "Palabras poco frecuentes: términos cultos, técnicos o regionales que conoce una persona muy leída.",
};

const SYSTEM = `Eres guionista de "El Rosco" del concurso Pasapalabra (España).
Escribes definiciones en español de España. Reglas:
- Cada respuesta es UNA sola palabra, sin espacios ni guiones: un sustantivo, adjetivo o verbo del diccionario de la RAE. Nada de nombres propios.
- "empieza": la respuesta empieza por la letra. "contiene": la respuesta contiene la letra; solo para Ñ, X e Y, cuando no haya buena palabra que empiece por ella.
- La Ñ es distinta de la N. Las tildes no cuentan.
- La definición no puede contener la respuesta ni una palabra de su familia.
- Estilo del programa: una frase breve y precisa, sin pistas como "empieza por".
- No repitas respuestas.
- Si otras palabras también responden bien a la definición, con la misma letra y las mismas reglas, ponlas en "otherAnswers" (hasta ${MAX_OTHER_ANSWERS}). Si no hay, omite el campo.
Responde SOLO con JSON con esta forma: {"clues":[{"letter":"A","type":"empieza","clue":"...","answer":"...","otherAnswers":["..."]}]}`;

/** The JSON Schema of the reply, for providers that can enforce one. */
export const REPLY_SCHEMA = {
  type: "object",
  properties: {
    clues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          letter: { type: "string" },
          type: { type: "string", enum: ["empieza", "contiene"] },
          clue: { type: "string" },
          answer: { type: "string" },
          otherAnswers: { type: "array", items: { type: "string" } },
        },
        required: ["letter", "type", "clue", "answer"],
      },
    },
  },
  required: ["clues"],
} as const;

/** The prompt that asks a model for the Clues of a request, in Spanish. */
export function promptFor({
  difficulty,
  letters,
  veryHard,
  avoid,
}: ClueRequest): Prompt {
  const lines = [
    `Dificultad general: ${DIFFICULTY_WORDS[difficulty]}`,
    `Escribe una definición para cada una de estas letras, en este orden: ${letters.join(", ")}.`,
  ];
  const hard = veryHard.filter((letter) => letters.includes(letter));
  if (hard.length > 0) {
    lines.push(
      `Para ${hard.length === 1 ? "la letra" : "las letras"} ${hard.join(" y ")} elige una palabra MUY difícil, de las que casi nadie acierta.`,
    );
  }
  if (avoid.length > 0) {
    lines.push(`No uses ninguna de estas respuestas: ${avoid.join(", ")}.`);
  }
  return { system: SYSTEM, user: lines.join("\n") };
}
