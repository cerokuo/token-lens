(function () {
  'use strict';

  const KEYS = {
    anthropic: 'apiKey_anthropic',
    gemini:    'apiKey_gemini'
  };

  // Only Anthropic and Gemini have count_tokens endpoints.
  // OpenAI is handled by network interception only — no key needed.
  const SUPPORTED_PLATFORMS = ['anthropic', 'gemini'];

  function chromeGet(keys) {
    return new Promise(resolve => {
      chrome.storage.sync.get(keys, result => resolve(result));
    });
  }

  function chromeSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(obj, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }

  function chromeRemove(keys) {
    return new Promise(resolve => {
      chrome.storage.sync.remove(keys, resolve);
    });
  }

  const Storage = {
    KEYS,
    SUPPORTED_PLATFORMS,

    async getApiKeys() {
      const storageKeys = Object.values(KEYS);
      const result = await chromeGet(storageKeys);
      return {
        anthropic: result[KEYS.anthropic] ?? null,
        gemini:    result[KEYS.gemini]    ?? null
      };
    },

    async setApiKey(platform, value) {
      if (!value || typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Invalid API key for platform "${platform}"`);
      }
      const storageKey = KEYS[platform];
      if (!storageKey) throw new Error(`Unknown platform "${platform}"`);
      return chromeSet({ [storageKey]: value.trim() });
    },

    async clearApiKey(platform) {
      const storageKey = KEYS[platform];
      if (!storageKey) return; // unknown platform — no-op
      return chromeRemove([storageKey]);
    },

    async hasApiKey(platform) {
      const storageKey = KEYS[platform];
      if (!storageKey) return false;
      const result = await chromeGet([storageKey]);
      return !!(result[storageKey]);
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.Storage = Storage;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
  }
})();
