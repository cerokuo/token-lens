const TokenCounter = require('../src/core/token-counter');

describe('TokenCounter', () => {
  describe('countTokens', () => {
    it('returns 0 for empty string', () => {
      expect(TokenCounter.countTokens('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(TokenCounter.countTokens('   ')).toBe(0);
    });

    it('returns positive count for simple text', () => {
      expect(TokenCounter.countTokens('Hello world')).toBeGreaterThan(0);
    });

    it('approximates within expected range for short text', () => {
      // "Hello world" is ~2 tokens in GPT-2 BPE
      const count = TokenCounter.countTokens('Hello world');
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(6);
    });

    it('handles punctuation as additional tokens', () => {
      const withPunct = TokenCounter.countTokens('Hello, world!');
      const withoutPunct = TokenCounter.countTokens('Hello world');
      expect(withPunct).toBeGreaterThanOrEqual(withoutPunct);
    });

    it('scales proportionally with text length', () => {
      const short = TokenCounter.countTokens('hello world');
      const long = TokenCounter.countTokens('hello world '.repeat(10));
      expect(long).toBeGreaterThan(short * 5);
    });

    it('handles 1000-word text without breaking', () => {
      const text = 'word '.repeat(1000);
      const count = TokenCounter.countTokens(text);
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(2000);
    });

    it('handles special characters', () => {
      expect(() => TokenCounter.countTokens('Hello 🌍 world!')).not.toThrow();
    });

    it('handles null gracefully', () => {
      expect(TokenCounter.countTokens(null)).toBe(0);
    });
  });

  describe('countTokensInMessages', () => {
    it('sums tokens across all messages', () => {
      const messages = ['Hello world', 'How are you'];
      const total = TokenCounter.countTokensInMessages(messages);
      expect(total).toBeGreaterThan(TokenCounter.countTokens('Hello world'));
    });

    it('handles empty array', () => {
      expect(TokenCounter.countTokensInMessages([])).toBe(0);
    });

    it('handles message objects with content field', () => {
      const messages = [{ content: 'Hello world' }, { content: 'Goodbye world' }];
      const total = TokenCounter.countTokensInMessages(messages);
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('getContextUsage', () => {
    it('returns 50 when half context is used', () => {
      expect(TokenCounter.getContextUsage(64000, 128000)).toBe(50);
    });

    it('caps at 100 when over limit', () => {
      expect(TokenCounter.getContextUsage(200000, 128000)).toBe(100);
    });

    it('returns 0 for zero tokens', () => {
      expect(TokenCounter.getContextUsage(0, 128000)).toBe(0);
    });

    it('returns 0 for zero context limit', () => {
      expect(TokenCounter.getContextUsage(1000, 0)).toBe(0);
    });
  });
});
