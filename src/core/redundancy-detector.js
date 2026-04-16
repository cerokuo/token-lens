(function () {
  'use strict';

  const RedundancyDetector = {
    getNGrams(text, n) {
      if (!text) return [];
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0);

      if (words.length < n) return [];
      const ngrams = [];
      for (let i = 0; i <= words.length - n; i++) {
        ngrams.push(words.slice(i, i + n).join(' '));
      }
      return ngrams;
    },

    detectRedundancy(messages, minCount = 2) {
      if (!Array.isArray(messages) || messages.length < 2) return [];

      const ngramFreq = {};
      const ngramSizes = [2, 3, 4, 5];

      for (const message of messages) {
        const text = typeof message === 'string' ? message : (message.content || message.text || '');
        if (!text) continue;
        // Use a Set so one message can't inflate the count for a phrase it contains twice
        const seen = new Set();
        for (const n of ngramSizes) {
          for (const gram of this.getNGrams(text, n)) {
            if (!seen.has(gram)) {
              ngramFreq[gram] = (ngramFreq[gram] || 0) + 1;
              seen.add(gram);
            }
          }
        }
      }

      const candidates = Object.entries(ngramFreq)
        .filter(([, count]) => count >= minCount)
        .map(([phrase, count]) => ({
          phrase,
          count,
          wordCount: phrase.split(' ').length,
          tokenWaste: Math.ceil(phrase.length / 4) * (count - 1)
        }))
        .sort((a, b) => b.tokenWaste - a.tokenWaste);

      // Remove sub-phrases subsumed by a longer repeated phrase with the same or higher count
      return candidates
        .filter(item =>
          !candidates.some(
            other =>
              other.phrase !== item.phrase &&
              other.wordCount > item.wordCount &&
              other.phrase.includes(item.phrase) &&
              other.count >= item.count
          )
        )
        .slice(0, 10);
    },

    getRedundancySuggestions(redundancies) {
      return redundancies.map(r => ({
        phrase: r.phrase,
        message: `"${r.phrase}" appears ${r.count} times — could save ~${r.tokenWaste} tokens`,
        severity: r.tokenWaste > 10 ? 'high' : r.tokenWaste > 5 ? 'medium' : 'low'
      }));
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.RedundancyDetector = RedundancyDetector;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RedundancyDetector;
  }
})();
