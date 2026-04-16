// Mock chrome.storage.sync before requiring the module
const mockStorage = {};
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, cb) => {
        const result = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => { if (mockStorage[k] !== undefined) result[k] = mockStorage[k]; });
        cb(result);
      }),
      set: jest.fn((obj, cb) => {
        Object.assign(mockStorage, obj);
        cb && cb();
      }),
      remove: jest.fn((keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => delete mockStorage[k]);
        cb && cb();
      })
    }
  },
  runtime: { lastError: null }
};

const Storage = require('../src/core/storage');

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  jest.clearAllMocks();
});

describe('Storage', () => {
  describe('getApiKeys', () => {
    it('returns null for both platforms when storage is empty', async () => {
      const keys = await Storage.getApiKeys();
      expect(keys.anthropic).toBeNull();
      expect(keys.gemini).toBeNull();
    });

    it('returns stored anthropic key', async () => {
      mockStorage['apiKey_anthropic'] = 'sk-ant-test123';
      const keys = await Storage.getApiKeys();
      expect(keys.anthropic).toBe('sk-ant-test123');
    });

    it('returns stored gemini key', async () => {
      mockStorage['apiKey_gemini'] = 'AIza-test456';
      const keys = await Storage.getApiKeys();
      expect(keys.gemini).toBe('AIza-test456');
    });

    it('returns both keys when both are stored', async () => {
      mockStorage['apiKey_anthropic'] = 'sk-ant-aaa';
      mockStorage['apiKey_gemini'] = 'AIza-bbb';
      const keys = await Storage.getApiKeys();
      expect(keys.anthropic).toBe('sk-ant-aaa');
      expect(keys.gemini).toBe('AIza-bbb');
    });
  });

  describe('setApiKey', () => {
    it('stores anthropic key correctly', async () => {
      await Storage.setApiKey('anthropic', 'sk-ant-newkey');
      expect(mockStorage['apiKey_anthropic']).toBe('sk-ant-newkey');
    });

    it('stores gemini key correctly', async () => {
      await Storage.setApiKey('gemini', 'AIza-newkey');
      expect(mockStorage['apiKey_gemini']).toBe('AIza-newkey');
    });

    it('overwrites an existing key', async () => {
      mockStorage['apiKey_anthropic'] = 'old-key';
      await Storage.setApiKey('anthropic', 'new-key');
      expect(mockStorage['apiKey_anthropic']).toBe('new-key');
    });

    it('rejects when key is empty string', async () => {
      await expect(Storage.setApiKey('anthropic', '')).rejects.toThrow();
    });

    it('rejects when key is null', async () => {
      await expect(Storage.setApiKey('anthropic', null)).rejects.toThrow();
    });
  });

  describe('clearApiKey', () => {
    it('removes the anthropic key', async () => {
      mockStorage['apiKey_anthropic'] = 'sk-ant-todelete';
      await Storage.clearApiKey('anthropic');
      expect(mockStorage['apiKey_anthropic']).toBeUndefined();
    });

    it('does not affect other keys when clearing one', async () => {
      mockStorage['apiKey_anthropic'] = 'sk-ant-keep';
      mockStorage['apiKey_gemini'] = 'AIza-keep';
      await Storage.clearApiKey('anthropic');
      expect(mockStorage['apiKey_gemini']).toBe('AIza-keep');
    });

    it('resolves cleanly when key does not exist', async () => {
      await expect(Storage.clearApiKey('anthropic')).resolves.not.toThrow();
    });
  });

  describe('hasApiKey', () => {
    it('returns true when key is stored', async () => {
      mockStorage['apiKey_anthropic'] = 'sk-ant-xxx';
      expect(await Storage.hasApiKey('anthropic')).toBe(true);
    });

    it('returns false when key is not stored', async () => {
      expect(await Storage.hasApiKey('anthropic')).toBe(false);
    });

    it('returns false for openai (never stored)', async () => {
      expect(await Storage.hasApiKey('openai')).toBe(false);
    });
  });
});
