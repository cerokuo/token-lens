(function () {
  'use strict';

  const STORAGE_KEY_EVENTS  = 'tokenEvents';
  const STORAGE_KEY_LIMITS  = 'quotaLimits_'; // per-platform: quotaLimits_claude, etc.

  const FIVE_HOUR_MS = 5  * 60 * 60 * 1000;
  const SEVEN_DAY_MS = 7  * 24 * 60 * 60 * 1000;
  const SIXTY_MIN_MS = 60 * 60 * 1000;

  // Default limits per platform (community estimates)
  const PLATFORM_DEFAULTS = {
    claude: { fiveHour: 1_000_000, weekly: 5_000_000 },
    openai: { fiveHour:   500_000, weekly: 2_500_000 },
    gemini: { fiveHour: 1_500_000, weekly: 7_500_000 }
  };

  const FALLBACK_DEFAULTS = { fiveHour: 1_000_000, weekly: 5_000_000 };

  // ── Storage helpers ───────────────────────────────────────────────────────
  function localGet(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, result => resolve(result));
    });
  }

  function localSet(obj) {
    return new Promise(resolve => {
      chrome.storage.local.set(obj, resolve);
    });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  async function loadEvents() {
    const result = await localGet([STORAGE_KEY_EVENTS]);
    return result[STORAGE_KEY_EVENTS] || [];
  }

  async function saveEvents(events) {
    return localSet({ [STORAGE_KEY_EVENTS]: events });
  }

  function sumTokensInWindow(events, platform, windowMs) {
    const cutoff = Date.now() - windowMs;
    return events
      .filter(e => e.platform === platform && e.timestamp >= cutoff)
      .reduce((sum, e) => sum + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
  }

  // ── Threshold classification ──────────────────────────────────────────────
  function getThresholdStatus(pct) {
    if (pct >= 100) return 'exceeded';
    if (pct >= 90)  return 'critical';
    if (pct >= 75)  return 'warning';
    return 'ok';
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const QuotaTracker = {
    getThresholdStatus,

    getDefaultLimits(platform) {
      return PLATFORM_DEFAULTS[platform] || FALLBACK_DEFAULTS;
    },

    async recordTokens(platform, inputTokens, outputTokens) {
      const events = await loadEvents();
      const cutoff = Date.now() - SEVEN_DAY_MS;
      const pruned = events.filter(e => e.timestamp >= cutoff);

      pruned.push({
        timestamp:    Date.now(),
        platform,
        inputTokens:  inputTokens  || 0,
        outputTokens: outputTokens || 0
      });

      return saveEvents(pruned);
    },

    async getWindowUsage(platform, windowMs) {
      const events = await loadEvents();
      return sumTokensInWindow(events, platform, windowMs);
    },

    async getLimits(platform) {
      const key    = STORAGE_KEY_LIMITS + (platform || 'claude');
      const result = await localGet([key]);
      const stored = result[key] || {};
      const def    = this.getDefaultLimits(platform);
      return {
        fiveHour: stored.fiveHour || def.fiveHour,
        weekly:   stored.weekly   || def.weekly
      };
    },

    async setLimits(fiveHour, weekly, platform) {
      if (!fiveHour || fiveHour <= 0) throw new Error('Five-hour limit must be a positive number');
      if (!weekly   || weekly   <= 0) throw new Error('Weekly limit must be a positive number');
      const key = STORAGE_KEY_LIMITS + (platform || 'claude');
      return localSet({ [key]: { fiveHour, weekly } });
    },

    async getBurnRate(platform) {
      const events = await loadEvents();
      const cutoff = Date.now() - SIXTY_MIN_MS;
      const recent = events.filter(e => e.platform === platform && e.timestamp >= cutoff);
      if (recent.length === 0) return 0;
      const total = recent.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
      return total / 60; // tokens per minute
    },

    async getUsageSummary(platform) {
      const [events, limits] = await Promise.all([loadEvents(), this.getLimits(platform)]);

      const fiveHourUsed = sumTokensInWindow(events, platform, FIVE_HOUR_MS);
      const weeklyUsed   = sumTokensInWindow(events, platform, SEVEN_DAY_MS);

      const fiveHourRemaining = Math.max(0, limits.fiveHour - fiveHourUsed);
      const weeklyRemaining   = Math.max(0, limits.weekly   - weeklyUsed);

      const fiveHourPct = Math.min(100, Math.round((fiveHourUsed / limits.fiveHour) * 100));
      const weeklyPct   = Math.min(100, Math.round((weeklyUsed   / limits.weekly)   * 100));

      // Burn rate (last 60 min)
      const cutoff60    = Date.now() - SIXTY_MIN_MS;
      const recent      = events.filter(e => e.platform === platform && e.timestamp >= cutoff60);
      const recentTotal = recent.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
      const burnPerMin  = recentTotal > 0 ? recentTotal / 60 : 0;
      const minutesLeft = burnPerMin > 0 ? Math.round(fiveHourRemaining / burnPerMin) : null;

      return {
        fiveHour: {
          used:      fiveHourUsed,
          limit:     limits.fiveHour,
          remaining: fiveHourRemaining,
          pct:       fiveHourPct,
          status:    getThresholdStatus(fiveHourPct)
        },
        weekly: {
          used:      weeklyUsed,
          limit:     limits.weekly,
          remaining: weeklyRemaining,
          pct:       weeklyPct,
          status:    getThresholdStatus(weeklyPct)
        },
        burnPerMin,
        minutesUntilBlocked: minutesLeft,
        limits
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.QuotaTracker = QuotaTracker;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuotaTracker;
  }
})();
