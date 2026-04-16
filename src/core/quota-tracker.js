(function () {
  'use strict';

  const STORAGE_KEY_EVENTS = 'tokenEvents';
  const STORAGE_KEY_LIMITS = 'quotaLimits';

  const FIVE_HOUR_MS  = 5  * 60 * 60 * 1000;
  const SEVEN_DAY_MS  = 7  * 24 * 60 * 60 * 1000;
  const SIXTY_MIN_MS  = 60 * 60 * 1000;

  const DEFAULTS = {
    fiveHour: 1_000_000, // community estimate for Claude Pro 5-hour window
    weekly:   5_000_000  // rough weekly estimate — user can override in settings
  };

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

  // ── Public API ────────────────────────────────────────────────────────────
  const QuotaTracker = {
    async recordTokens(platform, inputTokens, outputTokens) {
      const events = await loadEvents();

      // Prune events older than 7 days
      const cutoff = Date.now() - SEVEN_DAY_MS;
      const pruned = events.filter(e => e.timestamp >= cutoff);

      pruned.push({
        timestamp: Date.now(),
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

    async getLimits() {
      const result = await localGet([STORAGE_KEY_LIMITS]);
      const stored = result[STORAGE_KEY_LIMITS] || {};
      return {
        fiveHour: stored.fiveHour || DEFAULTS.fiveHour,
        weekly:   stored.weekly   || DEFAULTS.weekly
      };
    },

    async setLimits(fiveHour, weekly) {
      if (!fiveHour || fiveHour <= 0) throw new Error('Five-hour limit must be a positive number');
      if (!weekly   || weekly   <= 0) throw new Error('Weekly limit must be a positive number');
      return localSet({ [STORAGE_KEY_LIMITS]: { fiveHour, weekly } });
    },

    async getBurnRate(platform) {
      const events = await loadEvents();
      const cutoff = Date.now() - SIXTY_MIN_MS;
      const recent = events.filter(e => e.platform === platform && e.timestamp >= cutoff);
      if (recent.length === 0) return 0;

      const totalTokens = recent.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
      return totalTokens / 60; // tokens per minute
    },

    async getUsageSummary(platform) {
      const [events, limits] = await Promise.all([loadEvents(), this.getLimits()]);

      const fiveHourUsed = sumTokensInWindow(events, platform, FIVE_HOUR_MS);
      const weeklyUsed   = sumTokensInWindow(events, platform, SEVEN_DAY_MS);

      const fiveHourRemaining = Math.max(0, limits.fiveHour - fiveHourUsed);
      const weeklyRemaining   = Math.max(0, limits.weekly   - weeklyUsed);

      const fiveHourPct = Math.min(100, Math.round((fiveHourUsed / limits.fiveHour) * 100));
      const weeklyPct   = Math.min(100, Math.round((weeklyUsed   / limits.weekly)   * 100));

      // Burn rate from last 60 min
      const cutoff60    = Date.now() - SIXTY_MIN_MS;
      const recent      = events.filter(e => e.platform === platform && e.timestamp >= cutoff60);
      const recentTotal = recent.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
      const burnPerMin  = recentTotal > 0 ? recentTotal / 60 : 0;

      // Estimated minutes until 5-hour window exhausted
      const minutesLeft = burnPerMin > 0 ? Math.round(fiveHourRemaining / burnPerMin) : null;

      return {
        fiveHour: {
          used:      fiveHourUsed,
          limit:     limits.fiveHour,
          remaining: fiveHourRemaining,
          pct:       fiveHourPct
        },
        weekly: {
          used:    weeklyUsed,
          limit:   limits.weekly,
          remaining: weeklyRemaining,
          pct:     weeklyPct
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
