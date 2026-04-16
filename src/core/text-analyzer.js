(function () {
  'use strict';

  const STOPWORDS = new Set([
    // Articles
    'a', 'an', 'the',
    // Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    // Conjunctions
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'whether', 'although', 'because', 'since', 'while', 'if', 'then', 'that',
    // Pronouns
    'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
    'they', 'them', 'their', 'this', 'these', 'those', 'its',
    // Auxiliary verbs
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'need', 'ought', 'used', 'get', 'got',
    // AI-prompt filler (high-signal: worth flagging specifically)
    'please', 'kindly', 'just', 'basically', 'really', 'very', 'quite',
    'actually', 'literally', 'simply', 'certainly', 'definitely', 'absolutely',
    'obviously', 'clearly', 'indeed', 'perhaps', 'maybe', 'somewhat', 'rather',
    'fairly', 'kind', 'sort',
    // Common low-value words
    'also', 'too', 'as', 'well', 'so', 'now', 'here', 'there',
    'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'whose',
    'not', 'no', 'any', 'all', 'each', 'every', 'some', 'few', 'more',
    // Politeness / openers
    'hi', 'hello', 'hey', 'ok', 'okay', 'sure', 'yes', 'thank', 'thanks'
  ]);

  // Subset: words specifically wasteful in AI prompts
  const AI_FILLER = new Set([
    'please', 'kindly', 'just', 'basically', 'really', 'very', 'quite',
    'actually', 'literally', 'simply', 'certainly', 'definitely', 'absolutely',
    'obviously', 'clearly', 'perhaps', 'maybe', 'somewhat', 'rather', 'fairly',
    'kind', 'sort', 'thank', 'thanks', 'hi', 'hello', 'hey', 'ok', 'okay'
  ]);

  const TextAnalyzer = {
    STOPWORDS,
    AI_FILLER,

    tokenize(text) {
      if (!text) return [];
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0);
    },

    getTopWords(text, n = 20) {
      const words = this.tokenize(text);
      const freq = {};
      for (const word of words) {
        freq[word] = (freq[word] || 0) + 1;
      }
      return Object.entries(freq)
        .map(([word, count]) => ({
          word,
          count,
          isStopword: STOPWORDS.has(word),
          isAIFiller: AI_FILLER.has(word),
          tokenCost: Math.max(1, Math.ceil(word.length / 4)) * count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
    },

    getEfficiencyScore(text) {
      const words = this.tokenize(text);
      if (words.length === 0) return 100;
      const meaningful = words.filter(w => !STOPWORDS.has(w));
      return Math.round((meaningful.length / words.length) * 100);
    },

    getFillerTokens(text) {
      return this.tokenize(text).filter(w => AI_FILLER.has(w));
    },

    getFillerPercentage(text) {
      const words = this.tokenize(text);
      if (words.length === 0) return 0;
      const fillers = words.filter(w => AI_FILLER.has(w));
      return Math.round((fillers.length / words.length) * 100);
    },

    getSuggestions(text) {
      const fillers = this.getFillerTokens(text);
      const counts = {};
      for (const f of fillers) {
        counts[f] = (counts[f] || 0) + 1;
      }
      return Object.entries(counts).map(([word, count]) => ({
        type: 'filler',
        word,
        count,
        suggestion: `Remove "${word}" (×${count}) — saves ~${count} token${count > 1 ? 's' : ''}`
      }));
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.TextAnalyzer = TextAnalyzer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextAnalyzer;
  }
})();
