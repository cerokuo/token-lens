// Unit tests for maybeRecordDomTokens logic (extracted from content.js for testability)
// The function lives in content.js (browser context) so we re-implement the pure
// decision logic here and test it against QuotaTracker's recordTokens.

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

const NOW     = 1_700_000_000_000;
const DAY_MS  = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// ── Mirrors the maybeRecordDomTokens logic in content.js ──────────────────────
// State is kept as an object so tests can reset it easily.
function makeDomRecorder(QuotaTracker) {
  let lastRecordedMsgCount    = 0;
  let lastRecordedTotalTokens = 0;

  return {
    reset() {
      lastRecordedMsgCount    = 0;
      lastRecordedTotalTokens = 0;
    },

    async maybeRecordDomTokens(data, interceptReadingTimestamp = null) {
      const now = Date.now();

      // Skip: interceptor fired recently
      if (interceptReadingTimestamp && (now - interceptReadingTimestamp) < 30_000) return 'skipped:interceptor';

      const msgCount = (data.messageCount?.user || 0) + (data.messageCount?.ai || 0);

      // Skip: no new messages
      if (msgCount <= lastRecordedMsgCount) return 'skipped:no-new-messages';

      const delta = Math.max(0, data.totalTokens - lastRecordedTotalTokens);
      if (delta > 0) {
        await QuotaTracker.recordTokens(data.platform, delta, 0);
      }

      lastRecordedMsgCount    = msgCount;
      lastRecordedTotalTokens = data.totalTokens;
      return 'recorded';
    }
  };
}

beforeEach(() => {
  Object.keys(mockLocal).forEach(k => delete mockLocal[k]);
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => jest.restoreAllMocks());

describe('maybeRecordDomTokens', () => {
  it('records token delta when message count increases', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 500,
      messageCount: { user: 1, ai: 1 }
    });

    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(1);
    expect(events[0].inputTokens).toBe(500);
    expect(events[0].platform).toBe('claude');
  });

  it('records only the delta on subsequent turns', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 500,
      messageCount: { user: 1, ai: 1 }
    });

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 800,
      messageCount: { user: 2, ai: 2 }
    });

    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(2);
    // Second event should record only the 300-token delta, not 800
    expect(events[1].inputTokens).toBe(300);
  });

  it('skips recording when message count has not increased', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 500,
      messageCount: { user: 1, ai: 1 }
    });

    const result = await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 520,          // typing in input — same msg count
      messageCount: { user: 1, ai: 1 }
    });

    expect(result).toBe('skipped:no-new-messages');
    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(1);  // no second record
  });

  it('skips when network interceptor fired recently (< 30s)', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    const recentInterceptTimestamp = NOW - 10_000; // 10s ago — within 30s window
    const result = await recorder.maybeRecordDomTokens(
      { platform: 'claude', totalTokens: 500, messageCount: { user: 1, ai: 1 } },
      recentInterceptTimestamp
    );

    expect(result).toBe('skipped:interceptor');
    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(0);
  });

  it('records when interceptor timestamp is stale (> 30s)', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    const staleInterceptTimestamp = NOW - 35_000; // 35s ago — outside 30s window
    const result = await recorder.maybeRecordDomTokens(
      { platform: 'claude', totalTokens: 500, messageCount: { user: 1, ai: 1 } },
      staleInterceptTimestamp
    );

    expect(result).toBe('recorded');
    const events = mockLocal['tokenEvents'] || [];
    expect(events.length).toBe(1);
  });

  it('does not record a zero-delta even when message count increases', async () => {
    const recorder = makeDomRecorder(QuotaTracker);

    // First call sets totalTokens baseline to 500
    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 500,
      messageCount: { user: 1, ai: 1 }
    });

    // Second call with same token count but higher message count (edge case)
    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 500,
      messageCount: { user: 2, ai: 1 }
    });

    const events = mockLocal['tokenEvents'] || [];
    // Only the first event recorded; zero delta skipped
    expect(events.length).toBe(1);
  });

  it('accumulated events show up in getUsageSummary 5-hour window', async () => {
    const recorder = makeDomRecorder(QuotaTracker);
    // Small limit so pct is meaningful and not rounded to 0
    mockLocal['quotaLimits_claude'] = { fiveHour: 5000, weekly: 25_000 };

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 1000,
      messageCount: { user: 1, ai: 1 }
    });

    await recorder.maybeRecordDomTokens({
      platform: 'claude',
      totalTokens: 2500,
      messageCount: { user: 2, ai: 2 }
    });

    const summary = await QuotaTracker.getUsageSummary('claude');
    // 1000 (first) + 1500 (delta of second) = 2500
    expect(summary.fiveHour.used).toBe(2500);
    // 2500 / 5000 = 50%
    expect(summary.fiveHour.pct).toBe(50);
    expect(summary.fiveHour.status).toBe('ok');
  });
});
