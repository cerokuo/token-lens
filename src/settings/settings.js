'use strict';

const TL = window.TokenLens;

// ── Load existing keys on page open ───────────────────────────────────────
async function loadSavedKeys() {
  const keys = await TL.Storage.getApiKeys();

  if (keys.anthropic) {
    document.getElementById('input-anthropic').value = keys.anthropic;
    setStatus('anthropic', 'saved');
  }

  if (keys.gemini) {
    document.getElementById('input-gemini').value = keys.gemini;
    setStatus('gemini', 'saved');
  }
}

// ── Status helper ─────────────────────────────────────────────────────────
function setStatus(platform, state) {
  const el = document.getElementById(`status-${platform}`);
  if (!el) return;

  const labels = { saved: 'Key saved', error: 'Error', '': 'Not set' };
  const classes = { saved: 'status-saved', error: 'status-error', '': '' };

  el.textContent = labels[state] ?? 'Not set';
  el.className   = 'key-status ' + (classes[state] || '');
}

// ── Feedback helper ───────────────────────────────────────────────────────
function setFeedback(platform, message, type = '') {
  const el = document.getElementById(`feedback-${platform}`);
  if (!el) return;
  el.textContent = message;
  el.className   = `key-feedback ${type}`;

  if (message) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 5000);
}

// ── Show/hide toggle ──────────────────────────────────────────────────────
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// ── Save ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-save').forEach(btn => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;
    const input    = document.getElementById(`input-${platform}`);
    const value    = input?.value?.trim();

    if (!value) {
      setFeedback(platform, 'Please enter a key first.', 'error');
      return;
    }

    try {
      btn.disabled = true;
      await TL.Storage.setApiKey(platform, value);
      setStatus(platform, 'saved');
      setFeedback(platform, 'Key saved successfully.', 'success');
    } catch (e) {
      setFeedback(platform, `Failed to save: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
});

// ── Test connection ───────────────────────────────────────────────────────
document.querySelectorAll('.btn-test').forEach(btn => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;
    const input    = document.getElementById(`input-${platform}`);
    const apiKey   = input?.value?.trim();

    if (!apiKey) {
      setFeedback(platform, 'Enter a key first, then test.', 'error');
      return;
    }

    btn.disabled = true;
    setFeedback(platform, 'Testing…');

    try {
      // Minimal payload — just enough to get a valid response from the API
      const testMessages = [{ role: 'user', content: 'hi' }];
      const model = platform === 'anthropic' ? 'claude-sonnet-4' : 'gemini-2.0-flash';

      let result;
      if (platform === 'anthropic') {
        result = await TL.ApiClient.countTokensClaude(testMessages, model, apiKey);
      } else {
        const geminiContents = [{ role: 'user', parts: [{ text: 'hi' }] }];
        result = await TL.ApiClient.countTokensGemini(geminiContents, model, apiKey);
      }

      setFeedback(platform, `✓ Valid key — test prompt = ${result.inputTokens} tokens`, 'success');
      setStatus(platform, 'saved');
    } catch (e) {
      const msg = e.message.includes('401') ? 'Invalid API key'
                : e.message.includes('429') ? 'Rate limit hit — key is valid'
                : e.message.includes('403') ? 'Permission denied — check key scopes'
                : `Connection failed: ${e.message}`;
      setFeedback(platform, `✗ ${msg}`, 'error');
      setStatus(platform, 'error');
    } finally {
      btn.disabled = false;
    }
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-clear').forEach(btn => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;
    const input    = document.getElementById(`input-${platform}`);

    await TL.Storage.clearApiKey(platform);
    if (input) input.value = '';
    setStatus(platform, '');
    setFeedback(platform, 'Key removed. Falling back to Live / ~Est mode.');
  });
});

// ── Quota limits ─────────────────────────────────────────────────────────
async function loadSavedLimits() {
  // Load Claude limits (shown in settings — Claude is the one with hard 5h windows)
  const limits = await TL.QuotaTracker.getLimits('claude');
  const fiveEl = document.getElementById('input-fiveHour');
  const weekEl = document.getElementById('input-weekly');
  if (fiveEl) fiveEl.value = limits.fiveHour;
  if (weekEl) weekEl.value = limits.weekly;
}

document.getElementById('btn-save-limits')?.addEventListener('click', async () => {
  const fiveHour = parseInt(document.getElementById('input-fiveHour')?.value, 10);
  const weekly   = parseInt(document.getElementById('input-weekly')?.value,   10);

  try {
    // Save for all platforms so quota bars work everywhere
    await Promise.all([
      TL.QuotaTracker.setLimits(fiveHour, weekly, 'claude'),
      TL.QuotaTracker.setLimits(fiveHour, weekly, 'openai'),
      TL.QuotaTracker.setLimits(fiveHour, weekly, 'gemini')
    ]);
    document.getElementById('status-limits').textContent = 'Saved';
    document.getElementById('status-limits').className   = 'key-status status-saved';
    setFeedback('limits', 'Limits saved. The popup will reflect these on next open.', 'success');
  } catch (e) {
    setFeedback('limits', `Error: ${e.message}`, 'error');
  }
});

document.getElementById('btn-reset-limits')?.addEventListener('click', async () => {
  const defaults = TL.QuotaTracker.getDefaultLimits('claude');
  await Promise.all([
    TL.QuotaTracker.setLimits(defaults.fiveHour, defaults.weekly, 'claude'),
    TL.QuotaTracker.setLimits(defaults.fiveHour, defaults.weekly, 'openai'),
    TL.QuotaTracker.setLimits(defaults.fiveHour, defaults.weekly, 'gemini')
  ]);
  document.getElementById('input-fiveHour').value      = defaults.fiveHour;
  document.getElementById('input-weekly').value        = defaults.weekly;
  document.getElementById('status-limits').textContent = 'Defaults';
  document.getElementById('status-limits').className   = 'key-status';
  setFeedback('limits', 'Reset to defaults.', 'success');
});

// ── Init ─────────────────────────────────────────────────────────────────
loadSavedKeys();
loadSavedLimits();
