'use strict';

// Inject SVG gradient defs needed for gauge arc (can't live in CSS)
const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svgDefs.setAttribute('style', 'position:absolute;width:0;height:0');
svgDefs.innerHTML = `
  <defs>
    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#818CF8"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>`;
document.body.prepend(svgDefs);

// ── Constants ──────────────────────────────────────────────────────────────
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 56; // r=56 → ≈351.86

const PLATFORM_COLORS = { claude: 'claude', openai: 'openai', gemini: 'gemini' };

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);

const els = {
  emptyState:       $('emptyState'),
  mainContent:      $('mainContent'),
  footer:           $('footer'),
  platformPill:     $q('.platform-pill'),
  platformDot:      $('platformDot'),
  platformName:     $('platformName'),
  sourceBadge:      $('sourceBadge'),
  settingsBtn:      $('settingsBtn'),
  gaugeArc:         $('gaugeArc'),
  gaugeGlow:        $('gaugeGlow'),
  gaugeNum:         $('gaugeNum'),
  gaugeUnit:        $('gaugeUnit'),
  inputTokens:      $('inputTokens'),
  outputTokens:     $('outputTokens'),
  sessionCostCard:  $('sessionCostCard'),
  sessionCost:      $('sessionCost'),
  efficiencyValue:  $('efficiencyValue'),
  efficiencyBar:    $('efficiencyBar'),
  fillerPct:        $('fillerPct'),
  msgCount:         $('msgCount'),
  contextPct:       $('contextPct'),
  contextBar:       $('contextBar'),
  modelTag:         $('modelTag'),
  contextLimitLabel:$('contextLimitLabel'),
  wordsGrid:        $('wordsGrid'),
  suggestionsList:  $('suggestionsList'),
  redundancyList:   $('redundancyList'),
  footerModel:      $('footerModel'),
  footerTime:       $('footerTime'),
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatContextLimit(n) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000)     return `${n / 1_000}K`;
  return String(n);
}

function setGauge(pct) {
  const offset = GAUGE_CIRCUMFERENCE * (1 - Math.min(pct, 100) / 100);
  els.gaugeArc.style.strokeDashoffset  = offset;
  els.gaugeGlow.style.strokeDashoffset = offset;

  // Colour-shift at 75% and 90%
  const color = pct >= 90 ? '#f43f5e' : pct >= 75 ? '#f59e0b' : null;
  els.gaugeArc.style.stroke = color || 'url(#gaugeGradient)';
}

function setEfficiencyBar(score) {
  els.efficiencyBar.style.width = `${score}%`;
  const cls = score < 40 ? 'danger' : score < 65 ? 'warn' : '';
  els.efficiencyBar.className = 'bar-fill efficiency-fill ' + cls;
  els.efficiencyValue.className = 'score-value ' + cls;
}

function setContextBar(pct) {
  els.contextBar.style.width = `${Math.min(pct, 100)}%`;
  const cls = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : '';
  els.contextBar.className = 'bar-fill context-fill ' + cls;
}

function renderWords(words) {
  if (!words || words.length === 0) {
    els.wordsGrid.innerHTML = '<div class="panel-empty">Start a conversation to see your top words</div>';
    return;
  }
  els.wordsGrid.innerHTML = words
    .map(w => {
      const cls = w.isAIFiller ? 'filler' : w.isStopword ? 'stopword' : 'meaningful';
      const label = w.isAIFiller ? '⚠' : w.isStopword ? '' : '';
      return `<span class="word-chip ${cls}" title="${w.tokenCost} token cost">
        ${label ? `<span>${label}</span>` : ''}
        ${w.word}
        <span class="word-count">${w.count}</span>
      </span>`;
    })
    .join('');
}

function renderSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    els.suggestionsList.innerHTML = `
      <div class="panel-empty panel-good">
        <span class="good-icon">✓</span> Your prompt looks clean
      </div>`;
    return;
  }
  els.suggestionsList.innerHTML = suggestions
    .map(s => `
      <div class="suggestion-item">
        <div class="suggestion-icon">✕</div>
        <div>
          <div class="suggestion-text">
            Remove <span class="suggestion-word">"${s.word}"</span> (×${s.count})
          </div>
          <div class="suggestion-saving">Saves ~${s.count} token${s.count > 1 ? 's' : ''} per conversation</div>
        </div>
      </div>`)
    .join('');
}

function renderRedundancy(redundancies) {
  if (!redundancies || redundancies.length === 0) {
    els.redundancyList.innerHTML = '<div class="panel-empty">No repeated phrases detected</div>';
    return;
  }
  const suggestions = window.TokenLens.RedundancyDetector.getRedundancySuggestions(redundancies);
  els.redundancyList.innerHTML = suggestions
    .map(s => `
      <div class="redundancy-item">
        <div class="redundancy-row">
          <span class="redundancy-phrase">${s.phrase}</span>
          <span class="severity-badge ${s.severity}">${s.severity}</span>
        </div>
        <div class="redundancy-meta">${s.message}</div>
      </div>`)
    .join('');
}

// ── Render ─────────────────────────────────────────────────────────────────
function render(data) {
  if (!data) {
    els.emptyState.style.display   = 'flex';
    els.mainContent.style.display  = 'none';
    els.footer.style.display       = 'none';
    return;
  }

  els.emptyState.style.display   = 'none';
  els.mainContent.style.display  = 'flex';
  els.footer.style.display       = 'flex';

  // Data source badge
  renderSourceBadge(data.dataSource);

  // Quota
  renderQuota(data);

  // Platform pill
  const dotClass = PLATFORM_COLORS[data.platform] || '';
  els.platformDot.className = `platform-dot ${dotClass}`;
  const cfg = window.TokenLens.PlatformDetector.getPlatformConfig(data.platform);
  els.platformName.textContent = cfg ? cfg.name : data.platform;

  // Gauge — shows 5-hour quota when available, falls back to context usage
  let gaugePct, gaugeNum, gaugeUnit;
  if (data.quota?.fiveHour) {
    const fh  = data.quota.fiveHour;
    gaugePct  = fh.pct;
    gaugeNum  = formatTokens(fh.remaining);
    gaugeUnit = 'left in 5h';
  } else {
    gaugePct  = data.contextUsage || 0;
    gaugeNum  = formatTokens(data.totalTokens);
    gaugeUnit = data.totalTokens === 1 ? 'token' : 'tokens';
  }
  setGauge(gaugePct);
  els.gaugeNum.textContent  = gaugeNum;
  els.gaugeUnit.textContent = gaugeUnit;

  // Meta cards
  els.inputTokens.textContent  = formatTokens(data.inputTokens);
  els.outputTokens.textContent = formatTokens(data.outputTokens);

  // Est. Cost: only meaningful when exact token counts come from the API
  if (data.dataSource === 'api') {
    els.sessionCostCard.style.display = '';
    els.sessionCost.textContent = data.cost ? data.cost.formatted : '$0.0000';
  } else {
    els.sessionCostCard.style.display = 'none';
  }

  // Efficiency
  const score = data.efficiencyScore || 0;
  els.efficiencyValue.textContent = `${score}%`;
  setEfficiencyBar(score);
  els.fillerPct.textContent  = `${data.fillerPercentage || 0}%`;
  els.msgCount.textContent   = `${(data.messageCount?.user || 0) + (data.messageCount?.ai || 0)} messages`;

  // Context
  els.contextPct.textContent          = `${Math.round(usagePct)}%`;
  setContextBar(usagePct);
  els.modelTag.textContent            = data.model || '—';
  els.contextLimitLabel.textContent   = formatContextLimit(data.contextLimit);

  // Tabs
  renderWords(data.topWords);
  renderSuggestions(data.suggestions);
  renderRedundancy(data.redundancies);

  // Footer
  els.footerModel.textContent = data.model || '—';
  els.footerTime.textContent  = new Date(data.timestamp).toLocaleTimeString();
}

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Quota rendering ───────────────────────────────────────────────────────
const $id = id => document.getElementById(id);

function formatTokensShort(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function formatMinutes(mins) {
  if (mins === null) return '';
  if (mins < 60) return `~${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m left` : `~${h}h left`;
}

function setQuotaBar(barId, pct, status) {
  const bar = $id(barId);
  if (!bar) return;
  bar.style.width = `${Math.min(pct, 100)}%`;
  const cls = STATUS_COLORS[status] || '';
  bar.className = bar.className.replace(/ ?(warn|danger)/g, '').trim();
  if (cls) bar.className += ` ${cls}`;
}

const STATUS_COLORS = {
  ok:       '',
  warning:  'warn',
  critical: 'danger',
  exceeded: 'danger'
};

const STATUS_LABELS = {
  ok:       '',
  warning:  'Approaching limit',
  critical: 'Almost full',
  exceeded: 'Limit exceeded'
};

function renderQuota(data) {
  const section = $id('quotaSection');
  if (!section) return;

  if (!data.quota) { section.style.display = 'none'; return; }

  section.style.display = 'flex';

  const { fiveHour, weekly, minutesUntilBlocked } = data.quota;
  const fiveStatus = fiveHour.status || 'ok';
  const wkStatus   = weekly.status   || 'ok';

  // ── Blocked / warning banner ───────────────────────────────────────────
  const blockedEl  = $id('quotaBlocked');
  const isExceeded = fiveStatus === 'exceeded' || data.limitWarning?.blocked;
  const isWarning  = !isExceeded && (fiveStatus === 'warning' || fiveStatus === 'critical');

  if (isExceeded) {
    blockedEl.style.display    = 'flex';
    blockedEl.style.background = 'rgba(244,63,94,0.1)';
    blockedEl.style.borderColor = 'rgba(244,63,94,0.25)';
    blockedEl.querySelector('.blocked-icon').textContent = '⊘';
    blockedEl.querySelector('strong').textContent = 'Usage limit reached';
    const ms = data.limitWarning?.resetInMs;
    if (ms > 0) {
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      $id('blockedReset').textContent = `Resets in ${h > 0 ? h + 'h ' : ''}${m}m`;
    } else {
      $id('blockedReset').textContent = 'Resets in ~5h from first message';
    }
  } else if (isWarning) {
    blockedEl.style.display    = 'flex';
    blockedEl.style.background = 'rgba(245,158,11,0.08)';
    blockedEl.style.borderColor = 'rgba(245,158,11,0.2)';
    blockedEl.querySelector('.blocked-icon').textContent = '⚠';
    blockedEl.querySelector('strong').textContent = STATUS_LABELS[fiveStatus];
    $id('blockedReset').textContent = minutesUntilBlocked !== null
      ? `At current rate, limit in ${formatMinutes(minutesUntilBlocked).replace('~','').replace(' left','')}`
      : '';
  } else {
    blockedEl.style.display = 'none';
  }

  // ── Weekly bar ─────────────────────────────────────────────────────────
  $id('weeklyVals').textContent      = `${formatTokensShort(weekly.used)} / ${formatTokensShort(weekly.limit)}`;
  setQuotaBar('weeklyBar', weekly.pct, wkStatus);
  $id('weeklyRemaining').textContent = formatTokensShort(weekly.remaining);
  $id('weeklyBurn').textContent      = minutesUntilBlocked !== null ? formatMinutes(minutesUntilBlocked) : '';
}

// ── Source badge ──────────────────────────────────────────────────────────
const SOURCE_CONFIG = {
  api:       { label: 'API',   cls: 'source-api',  title: 'Exact counts from API' },
  intercept: { label: 'Live',  cls: 'source-live', title: 'Exact counts from network interception' },
  dom:       { label: '~Est',  cls: 'source-est',  title: 'Estimated from visible text' }
};

function renderSourceBadge(dataSource) {
  const cfg = SOURCE_CONFIG[dataSource] || SOURCE_CONFIG.dom;
  els.sourceBadge.textContent = cfg.label;
  els.sourceBadge.className   = `source-badge ${cfg.cls}`;
  els.sourceBadge.title       = cfg.title;
}

// ── Settings button ───────────────────────────────────────────────────────
els.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

document.addEventListener('click', e => {
  if (e.target.id === 'quotaSettingsLink') chrome.runtime.openOptionsPage();
});

// ── Live broadcast listener ───────────────────────────────────────────────
// Receives ANALYSIS_UPDATE pushed by content.js (intercept hits, API results,
// quota updates). This is what makes the popup update in real time without
// waiting for the 3s poll cycle.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ANALYSIS_UPDATE' && msg.data) render(msg.data);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
function bootstrap() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) { render(null); return; }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ANALYSIS' }, response => {
      if (chrome.runtime.lastError || !response?.data) {
        render(null);
        return;
      }
      render(response.data);
    });
  });
}

// Re-render every 3s while popup is open
bootstrap();
setInterval(bootstrap, 3000);
