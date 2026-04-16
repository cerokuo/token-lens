const TextAnalyzer = require('../src/core/text-analyzer');

describe('TextAnalyzer', () => {
  describe('tokenize', () => {
    it('splits text into lowercase words', () => {
      const words = TextAnalyzer.tokenize('Hello World');
      expect(words).toContain('hello');
      expect(words).toContain('world');
    });

    it('strips punctuation', () => {
      const words = TextAnalyzer.tokenize('Hello, world!');
      expect(words).toContain('hello');
      expect(words).toContain('world');
    });

    it('returns empty array for empty string', () => {
      expect(TextAnalyzer.tokenize('')).toEqual([]);
    });

    it('returns empty array for null', () => {
      expect(TextAnalyzer.tokenize(null)).toEqual([]);
    });
  });

  describe('getTopWords', () => {
    it('returns words sorted by frequency descending', () => {
      const text = 'the quick brown fox the quick the';
      const top = TextAnalyzer.getTopWords(text, 5);
      expect(top[0].word).toBe('the');
      expect(top[0].count).toBe(3);
    });

    it('limits results to N words', () => {
      const text = 'one two three four five six seven eight nine ten eleven';
      const top = TextAnalyzer.getTopWords(text, 5);
      expect(top.length).toBeLessThanOrEqual(5);
    });

    it('marks stopwords correctly', () => {
      const text = 'the quick brown fox';
      const words = TextAnalyzer.getTopWords(text, 10);
      const theWord = words.find(w => w.word === 'the');
      const foxWord = words.find(w => w.word === 'fox');
      expect(theWord.isStopword).toBe(true);
      expect(foxWord.isStopword).toBe(false);
    });

    it('marks AI filler words', () => {
      const text = 'please just basically help me';
      const words = TextAnalyzer.getTopWords(text, 10);
      const pleaseWord = words.find(w => w.word === 'please');
      expect(pleaseWord.isAIFiller).toBe(true);
    });

    it('includes tokenCost for each word', () => {
      const top = TextAnalyzer.getTopWords('hello world hello', 5);
      top.forEach(w => expect(w.tokenCost).toBeGreaterThan(0));
    });
  });

  describe('getEfficiencyScore', () => {
    it('returns high score for dense, meaningful text', () => {
      const score = TextAnalyzer.getEfficiencyScore('optimize database query index performance schema');
      expect(score).toBeGreaterThan(70);
    });

    it('returns low score for text full of stopwords', () => {
      const score = TextAnalyzer.getEfficiencyScore('the the the a a a is is is');
      expect(score).toBeLessThan(20);
    });

    it('always returns value between 0 and 100', () => {
      const texts = [
        'please could you just basically tell me',
        'write production-grade TypeScript authentication middleware',
        '',
        'a a a a a'
      ];
      texts.forEach(text => {
        const score = TextAnalyzer.getEfficiencyScore(text);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it('returns 100 for empty string', () => {
      expect(TextAnalyzer.getEfficiencyScore('')).toBe(100);
    });
  });

  describe('getFillerTokens', () => {
    it('identifies AI filler words', () => {
      const fillers = TextAnalyzer.getFillerTokens('Please could you just basically help me');
      expect(fillers.length).toBeGreaterThan(0);
      expect(fillers).toContain('please');
      expect(fillers).toContain('just');
      expect(fillers).toContain('basically');
    });

    it('returns empty array when no filler present', () => {
      const fillers = TextAnalyzer.getFillerTokens('Write authentication middleware for Express');
      expect(fillers.length).toBe(0);
    });
  });

  describe('getFillerPercentage', () => {
    it('returns percentage of filler words in text', () => {
      const pct = TextAnalyzer.getFillerPercentage('please just do it');
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThanOrEqual(100);
    });

    it('returns 0 for filler-free text', () => {
      const pct = TextAnalyzer.getFillerPercentage('authenticate users via JWT tokens');
      expect(pct).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(TextAnalyzer.getFillerPercentage('')).toBe(0);
    });
  });

  describe('getSuggestions', () => {
    it('returns suggestions for filler words found', () => {
      const suggestions = TextAnalyzer.getSuggestions('please please please just do this');
      expect(suggestions.length).toBeGreaterThan(0);
      const pleaseSuggestion = suggestions.find(s => s.word === 'please');
      expect(pleaseSuggestion).toBeDefined();
      expect(pleaseSuggestion.count).toBe(3);
    });

    it('returns empty array when no filler found', () => {
      const suggestions = TextAnalyzer.getSuggestions('implement JWT authentication middleware');
      expect(suggestions).toEqual([]);
    });

    it('includes token savings in each suggestion', () => {
      const suggestions = TextAnalyzer.getSuggestions('please just basically do this');
      suggestions.forEach(s => {
        expect(s.suggestion).toMatch(/token/i);
      });
    });
  });
});
