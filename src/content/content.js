(function () {
  'use strict';

  const TL = window.TokenLens;

  // ── Data source readings ───────────────────────────────────────────────────
  let interceptReading = null; // { inputTokens, outputTokens, timestamp } from injected.js
  let apiReading       = null; // { inputTokens, outputTokens, timestamp } from api-client.js

  // Staleness thresholds
  const API_TTL       = 30_000;  // 30s
  const INTERCEPT_TTL = 60_000;  // 60s

  // ── Real-time listener state ───────────────────────────────────────────────
  let pollInterval       = null;
  let inputEl            = null;
  let conversationEl     = null;
  let msgObserver        = null;
  let inputDebounceTimer = null;

  // ── Core DOM analysis ──────────────────────────────────────────────────────
  function buildDomReading() {
    const platform = TL.PlatformDetector.getCurrentPlatform();
    if (!platform) return null;

    const { userMessages, aiMessages } = TL.DOMExtractor.extractMessages(platform);
    const currentInput = TL.DOMExtractor.getCurrentInput(platform);
    const model        = TL.DOMExtractor.detectModel(platform);
    const contextLimit = TL.CostCalculator.getContextLimit(platform, model);

    const allUserText = [...userMessages, currentInput].join(' ');
    const allAiText   = aiMessages.join(' ');

    const domInputTokens  = TL.TokenCounter.countTokens(allUserText);
    const domOutputTokens = TL.TokenCounter.countTokens(allAiText);

    return {
      platform, model, contextLimit,
      userMessages, aiMessages,
      domInputTokens, domOutputTokens,
      topWords:        TL.TextAnalyzer.getTopWords(allUserText, 20),
      efficiencyScore: TL.TextAnalyzer.getEfficiencyScore(allUserText),
      fillerPercentage:TL.TextAnalyzer.getFillerPercentage(allUserText),
      suggestions:     TL.TextAnalyzer.getSuggestions(allUserText),
      redundancies:    TL.RedundancyDetector.detectRedundancy(userMessages),
      messageCount:    { user: userMessages.length, ai: aiMessages.length },
      timestamp:       Date.now()
    };
  }

  // ── Data source selector ───────────────────────────────────────────────────
  // Priority: API (most accurate) → Intercept (exact, from page's own calls) → DOM (estimate)
  function selectDataSource(dom) {
    const now = Date.now();

    let inputTokens, outputTokens, dataSource;

    if (apiReading && (now - apiReading.timestamp) < API_TTL) {
      inputTokens  = apiReading.inputTokens;
      outputTokens = apiReading.outputTokens;
      dataSource   = 'api';
    } else if (interceptReading && (now - interceptReading.timestamp) < INTERCEPT_TTL) {
      inputTokens  = interceptReading.inputTokens;
      outputTokens = interceptReading.outputTokens;
      dataSource   = 'intercept';
    } else {
      inputTokens  = dom.domInputTokens;
      outputTokens = dom.domOutputTokens;
      dataSource   = 'dom';
    }

    const totalTokens = inputTokens + outputTokens;

    return {
      platform:        dom.platform,
      model:           dom.model,
      inputTokens,
      outputTokens,
      totalTokens,
      contextLimit:    dom.contextLimit,
      contextUsage:    TL.TokenCounter.getContextUsage(totalTokens, dom.contextLimit),
      cost:            TL.CostCalculator.calculateSessionCost(inputTokens, outputTokens, dom.platform, dom.model),
      topWords:        dom.topWords,
      efficiencyScore: dom.efficiencyScore,
      fillerPercentage:dom.fillerPercentage,
      suggestions:     dom.suggestions,
      redundancies:    dom.redundancies,
      messageCount:    dom.messageCount,
      dataSource,
      timestamp:       dom.timestamp
    };
  }

  function analyzeConversation() {
    const dom = buildDomReading();
    return dom ? selectDataSource(dom) : null;
  }

  function broadcast(data) {
    try { chrome.runtime.sendMessage({ type: 'ANALYSIS_UPDATE', data }); } catch (_) {}
  }

  function analyzeAndBroadcast() {
    const data = analyzeConversation();
    if (data) broadcast(data);
  }

  // ── API-key-based counting (fires when popup opens) ────────────────────────
  async function triggerApiCountIfAvailable(dom) {
    if (!dom || dom.platform === 'openai') return; // OpenAI: no count_tokens endpoint

    try {
      const keys   = await TL.Storage.getApiKeys();
      const apiKey = dom.platform === 'claude' ? keys.anthropic : keys.gemini;
      if (!apiKey) return;

      const result = await TL.ApiClient.countTokens(
        dom.platform, dom.userMessages, dom.aiMessages, dom.model, apiKey
      );
      if (!result) return;

      apiReading = { ...result, timestamp: Date.now() };
      analyzeAndBroadcast(); // push fresh accurate data to popup
    } catch (_) {
      // API call failed (bad key, network, rate limit) — fall back gracefully
    }
  }

  // ── Network intercept listener ─────────────────────────────────────────────
  window.addEventListener('message', event => {
    if (event.source !== window) return; // same-window only
    const d = event.data;
    if (!d || d.type !== 'TOKENLENS_USAGE' || d.source !== 'intercept') return;

    // Validate: must be non-negative numbers
    if (typeof d.inputTokens !== 'number' || typeof d.outputTokens !== 'number') return;
    if (d.inputTokens < 0 || d.outputTokens < 0) return;

    interceptReading = {
      inputTokens:  Math.floor(d.inputTokens),
      outputTokens: Math.floor(d.outputTokens),
      timestamp:    Date.now()
    };
    analyzeAndBroadcast();
  });

  // ── Real-time input listener ───────────────────────────────────────────────
  function onInputChange() {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(analyzeAndBroadcast, 150);
  }

  function attachInputListener(platform) {
    const el = TL.DOMExtractor.getInputElement(platform);
    if (!el || el === inputEl) return;
    if (inputEl) {
      inputEl.removeEventListener('input', onInputChange);
      inputEl.removeEventListener('keyup', onInputChange);
    }
    inputEl = el;
    inputEl.addEventListener('input', onInputChange);
    inputEl.addEventListener('keyup', onInputChange);
  }

  // ── Conversation MutationObserver ─────────────────────────────────────────
  function attachMessageObserver(platform) {
    const container = TL.DOMExtractor.getConversationContainer(platform);
    if (!container || container === conversationEl) return;
    if (msgObserver) msgObserver.disconnect();
    conversationEl = container;
    msgObserver = new MutationObserver(() => setTimeout(analyzeAndBroadcast, 200));
    msgObserver.observe(conversationEl, { childList: true, subtree: true, characterData: true });
  }

  // ── Popup message handler ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_ANALYSIS') {
      const dom  = buildDomReading();
      const data = dom ? selectDataSource(dom) : null;
      sendResponse({ data });
      // Fire API count asynchronously — result will arrive on next broadcast
      if (dom) triggerApiCountIfAvailable(dom);
    }
    return true;
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function init() {
    const platform = TL.PlatformDetector.getCurrentPlatform();
    if (!platform) return;

    analyzeAndBroadcast();
    attachInputListener(platform);
    attachMessageObserver(platform);

    if (!pollInterval) {
      pollInterval = setInterval(() => {
        const p = TL.PlatformDetector.getCurrentPlatform();
        if (!p) return;
        attachInputListener(p);
        attachMessageObserver(p);
        analyzeAndBroadcast();
      }, 5000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // SPA navigation reset
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl        = location.href;
    inputEl        = null;
    conversationEl = null;
    interceptReading = null;
    apiReading       = null;
    if (msgObserver) { msgObserver.disconnect(); msgObserver = null; }
    setTimeout(init, 1000);
  }).observe(document, { subtree: true, childList: true });
})();
