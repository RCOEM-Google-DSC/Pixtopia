import { describe, it, expect } from 'vitest';
import { round4PartBQuestions } from '@/lib/round4PartB';

describe('Round 4 Part B Static Configuration', () => {
  it('should export an array of 3 questions', () => {
    expect(Array.isArray(round4PartBQuestions)).toBe(true);
    expect(round4PartBQuestions.length).toBe(3);
  });

  it('should have all required fields for each question', () => {
    round4PartBQuestions.forEach((q, index) => {
      expect(q).toHaveProperty('order', index + 4);
      expect(q).toHaveProperty('video_url');
      expect(q).toHaveProperty('options');
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBe(4);
      expect(q).toHaveProperty('answer_index');
      expect(typeof q.answer_index).toBe('number');
      expect(q).toHaveProperty('hint');
      expect(q).toHaveProperty('hint_cost');
      expect(q).toHaveProperty('points');
    });
  });
});
