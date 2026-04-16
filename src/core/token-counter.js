(function () {
  'use strict';

  /**
   * Approximates token count using a hybrid word/character approach.
   * Rule of thumb: ~4 chars per token (OpenAI guidance), refined by word
   * boundaries and punctuation splitting.
   */
  const TokenCounter = {
    countTokens(text) {
      if (!text || typeof text !== 'string') return 0;
      const trimmed = text.trim();
      if (trimmed === '') return 0;

      const words = trimmed.split(/\s+/);
      let count = 0;

      for (const word of words) {
        if (!word) continue;
        // Each punctuation character adjacent to a word is likely its own token
        const punctCount = (word.match(/[^a-zA-Z0-9]/g) || []).length;
        const charBase = Math.ceil(word.length / 4);
        count += Math.max(1, charBase) + Math.floor(punctCount * 0.5);
      }

      // Take the max of word-based and raw char/4 estimates
      return Math.max(count, Math.ceil(trimmed.length / 4));
    },

    countTokensInMessages(messages) {
      if (!Array.isArray(messages)) return 0;
      return messages.reduce((sum, msg) => {
        const text = typeof msg === 'string' ? msg : (msg.content || msg.text || '');
        return sum + this.countTokens(text);
      }, 0);
    },

    getContextUsage(tokenCount, contextLimit) {
      if (!contextLimit || contextLimit === 0) return 0;
      return Math.min(100, (tokenCount / contextLimit) * 100);
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.TokenCounter = TokenCounter;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenCounter;
  }
})();
