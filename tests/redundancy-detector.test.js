const RedundancyDetector = require('../src/core/redundancy-detector');

describe('RedundancyDetector', () => {
  describe('getNGrams', () => {
    it('extracts bigrams from text', () => {
      const ngrams = RedundancyDetector.getNGrams('hello world foo', 2);
      expect(ngrams).toContain('hello world');
      expect(ngrams).toContain('world foo');
    });

    it('extracts trigrams from text', () => {
      const ngrams = RedundancyDetector.getNGrams('one two three four', 3);
      expect(ngrams).toContain('one two three');
      expect(ngrams).toContain('two three four');
    });

    it('returns empty array for text shorter than n', () => {
      const ngrams = RedundancyDetector.getNGrams('hello', 3);
      expect(ngrams).toEqual([]);
    });

    it('is case-insensitive', () => {
      const ngrams = RedundancyDetector.getNGrams('Hello World', 2);
      expect(ngrams).toContain('hello world');
    });
  });

  describe('detectRedundancy', () => {
    it('detects repeated phrases across messages', () => {
      const messages = [
        'Please make sure to format the output as JSON',
        'Please make sure to include all fields in the response',
        'Please make sure to handle errors properly in all cases'
      ];
      const redundancies = RedundancyDetector.detectRedundancy(messages);
      expect(redundancies.length).toBeGreaterThan(0);
      const phrases = redundancies.map(r => r.phrase);
      expect(phrases.some(p => p.includes('please make sure'))).toBe(true);
    });

    it('returns empty array for non-redundant messages', () => {
      const messages = [
        'Write a function to sort an array using quicksort',
        'Add error handling with try-catch blocks',
        'Write unit tests covering edge cases'
      ];
      const redundancies = RedundancyDetector.detectRedundancy(messages);
      expect(redundancies.length).toBe(0);
    });

    it('returns empty array for single message', () => {
      const redundancies = RedundancyDetector.detectRedundancy(['only one message here']);
      expect(redundancies.length).toBe(0);
    });

    it('returns empty array for empty array', () => {
      expect(RedundancyDetector.detectRedundancy([])).toEqual([]);
    });

    it('each result includes phrase, count, and tokenWaste', () => {
      const messages = [
        'please make sure the output is correct',
        'please make sure the format is JSON',
        'please make sure the errors are handled'
      ];
      const redundancies = RedundancyDetector.detectRedundancy(messages);
      if (redundancies.length > 0) {
        expect(redundancies[0]).toHaveProperty('phrase');
        expect(redundancies[0]).toHaveProperty('count');
        expect(redundancies[0]).toHaveProperty('tokenWaste');
        expect(redundancies[0].count).toBeGreaterThanOrEqual(2);
        expect(redundancies[0].tokenWaste).toBeGreaterThan(0);
      }
    });

    it('longer repeated phrases rank higher than shorter sub-phrases', () => {
      const messages = [
        'please make sure to check all edge cases',
        'please make sure to validate all inputs',
        'please make sure to handle all errors'
      ];
      const redundancies = RedundancyDetector.detectRedundancy(messages);
      if (redundancies.length > 1) {
        expect(redundancies[0].wordCount).toBeGreaterThanOrEqual(redundancies[1].wordCount);
      }
    });

    it('returns no more than 10 results', () => {
      const base = 'common phrase repeated often in messages about this topic';
      const messages = Array.from({ length: 15 }, (_, i) => `${base} number ${i}`);
      const redundancies = RedundancyDetector.detectRedundancy(messages);
      expect(redundancies.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getRedundancySuggestions', () => {
    it('formats redundancies as human-readable suggestions', () => {
      const redundancies = [
        { phrase: 'please make sure', count: 3, tokenWaste: 9, wordCount: 3 }
      ];
      const suggestions = RedundancyDetector.getRedundancySuggestions(redundancies);
      expect(suggestions[0].message).toMatch(/please make sure/);
      expect(suggestions[0].message).toMatch(/3 times/);
    });

    it('assigns severity based on tokenWaste', () => {
      const redundancies = [
        { phrase: 'big repeated phrase here now', count: 5, tokenWaste: 20, wordCount: 5 },
        { phrase: 'medium repeated', count: 3, tokenWaste: 7, wordCount: 2 },
        { phrase: 'small', count: 2, tokenWaste: 2, wordCount: 1 }
      ];
      const suggestions = RedundancyDetector.getRedundancySuggestions(redundancies);
      expect(suggestions[0].severity).toBe('high');
      expect(suggestions[1].severity).toBe('medium');
      expect(suggestions[2].severity).toBe('low');
    });
  });
});
