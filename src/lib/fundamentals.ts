import fundamentalsJson from "../data/fundamentals.json";
import type { PlaybookSource } from "./playbooks";

export interface OpeningRead {
  /** Something you can see when scouting the enemy's base early. */
  sign: string;
  /** What it usually means and how to respond. */
  means: string;
}

export interface Fundamentals {
  openingReads: OpeningRead[];
  habits: string[];
  sources: PlaybookSource[];
}

export const fundamentals = fundamentalsJson as Fundamentals;
