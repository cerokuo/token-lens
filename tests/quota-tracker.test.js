// Mock chrome.storage.local before requiring the module
const mockLocal = {};
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, cb) => {
        const result = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => { if (mockLocal[k] !== undefined) result[k] = mockLocal[k]; });
        cb(result);
      }),
      set: jest.fn((obj, cb) => { Object.assign(mockLocal, obj); cb && cb(); }),
      remove: jest.fn((keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => delete mockLocal[k]);
        cb && cb();
      })
    },
    sync: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn((obj, cb) => { cb && cb(); })
    }
  },
  runtime: { lastError: null }
};

const QuotaTracker = require('../src/core/quota-tracker');

const NOW      = 1_700_000_000_000; // fixed timestamp for tests
const HOUR_MS  = 60 * 60 * 1000;
const DAY_MS   = 24 * HOUR_MS;

beforeEach(() => {
  Object.keys(mockLocal).forEach(k => delete mockLocal[k]);
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => jest.restoreAllMocks());

// ── recordTokens ───────────────────────────────────────────────────────────
describe('QuotaTracker.recordTokens', () => {
  it('stores a new token event in local storage', async () => {
    await QuotaTracker.recordTokens('claude', 100, 50);
    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(1);
    expect(events[0].inputTokens).toBe(100);
    expect(events[0].outputTokens).toBe(50);
    expect(events[0].platform).toBe('claude');
    expect(events[0].timestamp).toBe(NOW);
  });

  it('appends to existing events', async () => {
    await QuotaTracker.recordTokens('claude', 100, 50);
    await QuotaTracker.recordTokens('claude', 200, 80);
    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(2);
  });

  it('prunes events older than 7 days when recording', async () => {
    const oldEvent = { timestamp: NOW - 8 * DAY_MS, inputTokens: 999, outputTokens: 0, platform: 'claude' };
    mockLocal['tokenEvents'] = [oldEvent];
    await QuotaTracker.recordTokens('claude', 10, 5);
    const events = mockLocal['tokenEvents'];
    expect(events.some(e => e.inputTokens === 999)).toBe(false);
    expect(events.length).toBe(1);
  });

  it('keeps events within 7 days', async () => {
    const recentEvent = { timestamp: NOW - 6 * DAY_MS, inputTokens: 100, outputTokens: 0, platform: 'claude' };
    mockLocal['tokenEvents'] = [recentEvent];
    await QuotaTracker.recordTokens('claude', 10, 5);
    const events = mockLocal['tokenEvents'];
    expect(events.length).toBe(2);
  });
});

// ── getWindowUsage ─────────────────────────────────────────────────────────
describe('QuotaTracker.getWindowUsage', () => {
  beforeEach(async () => {
    // Seed events at various ages
    mockLocal['tokenEvents'] = [
      { timestamp: NOW - 1 * HOUR_MS,  inputTokens: 1000, outputTokens: 200,  platform: 'claude' }, // 1h ago
      { timestamp: NOW - 3 * HOUR_MS,  inputTokens: 500,  outputTokens: 100,  platform: 'claude' }, // 3h ago
      { timestamp: NOW - 6 * HOUR_MS,  inputTokens: 800,  outputTokens: 150,  platform: 'claude' }, // 6h ago — outside 5h
      { timestamp: NOW - 2 * DAY_MS,   inputTokens: 2000, outputTokens: 400,  platform: 'claude' }, // 2d ago
      { timestamp: NOW - 30 * 60_000,  inputTokens: 300,  outputTokens: 60,   platform: 'openai' }, // different platform
    ];
  });

  it('sums tokens within the 5-hour window for claude', async () => {
    const usage = await QuotaTracker.getWindowUsage('claude', 5 * HOUR_MS);
    // 1h ago + 3h ago = 1200 + 600 = 1800 total
    expect(usage).toBe(1800);
  });

  it('excludes tokens outside the window', async () => {
    const usage = await QuotaTracker.getWindowUsage('claude', 5 * HOUR_MS);
    // 6h ago event should be excluded
    expect(usage).toBeLessThan(1000 + 200 + 500 + 100 + 800 + 150);
  });

  it('excludes tokens from other platforms', async () => {
    const usage = await QuotaTracker.getWindowUsage('claude', 5 * HOUR_MS);
    // openai event should not be counted
    expect(usage).toBe(1800);
  });

  it('sums weekly usage correctly', async () => {
    const usage = await QuotaTracker.getWindowUsage('claude', 7 * DAY_MS);
    // All claude events: 1000+200 + 500+100 + 800+150 + 2000+400 = 5150
    expect(usage).toBe(5150);
  });

  it('returns 0 when no events exist', async () => {
    mockLocal['tokenEvents'] = [];
    const usage = await QuotaTracker.getWindowUsage('claude', 5 * HOUR_MS);
    expect(usage).toBe(0);
  });
});

// ── getUsageSummary ────────────────────────────────────────────────────────
describe('QuotaTracker.getUsageSummary', () => {
  beforeEach(() => {
    mockLocal['tokenEvents'] = [
      { timestamp: NOW - 1 * HOUR_MS, inputTokens: 100000, outputTokens: 20000, platform: 'claude' },
      { timestamp: NOW - 3 * HOUR_MS, inputTokens: 50000,  outputTokens: 10000, platform: 'claude' },
      { timestamp: NOW - 2 * DAY_MS,  inputTokens: 200000, outputTokens: 40000, platform: 'claude' },
    ];
    mockLocal['quotaLimits'] = { fiveHour: 1000000, weekly: 5000000 };
  });

  it('returns fiveHour and weekly objects', async () => {
    const summary = await QuotaTracker.getUsageSummary('claude');
    expect(summary).toHaveProperty('fiveHour');
    expect(summary).toHaveProperty('weekly');
  });

  it('fiveHour.used equals sum of tokens in last 5 hours', async () => {
    const summary = await QuotaTracker.getUsageSummary('claude');
    // 1h ago: 120000, 3h ago: 60000 = 180000
    expect(summary.fiveHour.used).toBe(180000);
  });

  it('fiveHour.remaining equals limit minus used', async () => {
    const summary = await QuotaTracker.getUsageSummary('claude');
    expect(summary.fiveHour.remaining).toBe(1000000 - 180000);
  });

  it('fiveHour.pct is between 0 and 100', async () => {
    const summary = await QuotaTracker.getUsageSummary('claude');
    expect(summary.fiveHour.pct).toBeGreaterThanOrEqual(0);
    expect(summary.fiveHour.pct).toBeLessThanOrEqual(100);
  });

  it('weekly.used includes events from the last 7 days', async () => {
    const summary = await QuotaTracker.getUsageSummary('claude');
    // 5h window + 2 day old event: 180000 + 240000 = 420000
    expect(summary.weekly.used).toBe(420000);
  });

  it('clamps pct to 100 when over limit', async () => {
    mockLocal['quotaLimits'] = { fiveHour: 1000, weekly: 5000000 };
    const summary = await QuotaTracker.getUsageSummary('claude');
    expect(summary.fiveHour.pct).toBe(100);
  });
});

// ── getLimits / setLimits ─────────────────────────────────────────────────
describe('QuotaTracker limits', () => {
  it('returns default limits when none are set', async () => {
    const limits = await QuotaTracker.getLimits();
    expect(limits.fiveHour).toBeGreaterThan(0);
    expect(limits.weekly).toBeGreaterThan(0);
  });

  it('stores and retrieves custom limits', async () => {
    await QuotaTracker.setLimits(500000, 2000000);
    const limits = await QuotaTracker.getLimits();
    expect(limits.fiveHour).toBe(500000);
    expect(limits.weekly).toBe(2000000);
  });

  it('rejects non-positive limits', async () => {
    await expect(QuotaTracker.setLimits(0, 1000000)).rejects.toThrow();
    await expect(QuotaTracker.setLimits(-1, 1000000)).rejects.toThrow();
  });
});

// ── getBurnRate ────────────────────────────────────────────────────────────
describe('QuotaTracker.getBurnRate', () => {
  it('returns tokens per minute based on last 60 minutes', async () => {
    mockLocal['tokenEvents'] = [
      { timestamp: NOW - 30 * 60_000, inputTokens: 60000, outputTokens: 0, platform: 'claude' },
    ];
    const rate = await QuotaTracker.getBurnRate('claude');
    // 60000 tokens in 60 min = 1000 tokens/min
    expect(rate).toBeCloseTo(1000, -1);
  });

  it('returns 0 when no recent activity', async () => {
    mockLocal['tokenEvents'] = [
      { timestamp: NOW - 2 * HOUR_MS, inputTokens: 50000, outputTokens: 0, platform: 'claude' },
    ];
    const rate = await QuotaTracker.getBurnRate('claude');
    expect(rate).toBe(0);
  });

  it('returns 0 when no events at all', async () => {
    mockLocal['tokenEvents'] = [];
    const rate = await QuotaTracker.getBurnRate('claude');
    expect(rate).toBe(0);
  });
});
