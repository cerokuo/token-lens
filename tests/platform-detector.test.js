const PlatformDetector = require('../src/content/platform-detector');

describe('PlatformDetector', () => {
  describe('detectPlatform', () => {
    it('detects Claude from claude.ai hostname', () => {
      expect(PlatformDetector.detectPlatform('claude.ai')).toBe('claude');
    });

    it('detects OpenAI from chat.openai.com', () => {
      expect(PlatformDetector.detectPlatform('chat.openai.com')).toBe('openai');
    });

    it('detects OpenAI from chatgpt.com', () => {
      expect(PlatformDetector.detectPlatform('chatgpt.com')).toBe('openai');
    });

    it('detects Gemini from gemini.google.com', () => {
      expect(PlatformDetector.detectPlatform('gemini.google.com')).toBe('gemini');
    });

    it('returns null for unknown hostname', () => {
      expect(PlatformDetector.detectPlatform('example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(PlatformDetector.detectPlatform('')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(PlatformDetector.detectPlatform(null)).toBeNull();
    });
  });

  describe('getPlatformConfig', () => {
    it('returns config object for Claude', () => {
      const config = PlatformDetector.getPlatformConfig('claude');
      expect(config).toBeDefined();
      expect(config.name).toBe('Claude');
      expect(config.defaultModel).toBeDefined();
      expect(config.color).toBeDefined();
    });

    it('returns config for OpenAI', () => {
      const config = PlatformDetector.getPlatformConfig('openai');
      expect(config.name).toBe('ChatGPT');
      expect(config.models).toContain('gpt-4o');
    });

    it('returns config for Gemini', () => {
      const config = PlatformDetector.getPlatformConfig('gemini');
      expect(config.name).toBe('Gemini');
      expect(config.models.length).toBeGreaterThan(0);
    });

    it('returns null for unknown platform', () => {
      expect(PlatformDetector.getPlatformConfig('unknown')).toBeNull();
    });

    it('each platform config has required fields', () => {
      ['claude', 'openai', 'gemini'].forEach(platform => {
        const config = PlatformDetector.getPlatformConfig(platform);
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('company');
        expect(config).toHaveProperty('color');
        expect(config).toHaveProperty('defaultModel');
        expect(config).toHaveProperty('models');
        expect(config).toHaveProperty('hostnames');
      });
    });
  });
});
