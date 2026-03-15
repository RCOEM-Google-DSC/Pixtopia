import questions from './round4PartBQuestions.json';

export interface Round4PartBQuestion {
  order: number;
  question: string;
  video_url: string;
  options: string[];
  correct_index: number;
  hint: string;
  hint_cost: number;
  points: number;
}

export const round4PartBQuestions: Round4PartBQuestion[] = questions;
