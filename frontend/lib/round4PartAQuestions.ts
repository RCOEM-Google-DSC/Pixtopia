/**
 * Static Part A (rebus) puzzle answers for Round 4.
 * Used by API routes for instant answer validation without DB queries.
 * Must stay in sync with the seed script (scripts/seedRound4.js).
 */

export interface Round4PartAQuestion {
  order: number;
  answer: string;
  hint: string;
  points: number;
}

export const round4PartAQuestions: Round4PartAQuestion[] = [
  {
    order: 1,
    answer: "McQueen",
    hint: "cars character",
    points: 100,
  },
  {
    order: 2,
    answer: "Woody",
    hint: "Toy story character",
    points: 100,
  },
];
