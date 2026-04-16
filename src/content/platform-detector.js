(function () {
  'use strict';

  const PLATFORM_CONFIGS = {
    claude: {
      name: 'Claude',
      company: 'Anthropic',
      color: '#D97706',
      defaultModel: 'claude-sonnet-4',
      models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'],
      hostnames: ['claude.ai']
    },
    openai: {
      name: 'ChatGPT',
      company: 'OpenAI',
      color: '#10B981',
      defaultModel: 'gpt-4o',
      models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
      hostnames: ['chat.openai.com', 'chatgpt.com']
    },
    gemini: {
      name: 'Gemini',
      company: 'Google',
      color: '#6366F1',
      defaultModel: 'gemini-2.0-flash',
      models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      hostnames: ['gemini.google.com']
    }
  };

  const PlatformDetector = {
    PLATFORM_CONFIGS,

    detectPlatform(hostname) {
      if (!hostname) return null;
      for (const [key, config] of Object.entries(PLATFORM_CONFIGS)) {
        if (config.hostnames.some(h => hostname.includes(h))) return key;
      }
      return null;
    },

    getPlatformConfig(platform) {
      return PLATFORM_CONFIGS[platform] || null;
    },

    getCurrentPlatform() {
      if (typeof window !== 'undefined' && window.location) {
        return this.detectPlatform(window.location.hostname);
      }
      return null;
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.PlatformDetector = PlatformDetector;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatformDetector;
  }
})();
