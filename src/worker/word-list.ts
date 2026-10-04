import wordList from "../../data/word-list.json";
import type { Word } from "../shared/word-list";

/** The Word List the Roscos are drawn from (ADR 0005), bundled with the Worker. */
export const WORDS: readonly Word[] = wordList.words;
