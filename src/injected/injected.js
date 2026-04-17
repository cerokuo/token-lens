/**
 * injected.js — runs in MAIN world at document_start.
 * Wraps window.fetch to intercept AI platform API responses and extract
 * exact token usage. Communicates back to the content script world via
 * window.postMessage only (no chrome.* APIs available here).
 */
(function () {
  'use strict';

  // ── URL matchers ──────────────────────────────────────────────────────────
  // Each platform's actual API endpoint patterns
  const MATCHERS = [
    {
      platform: 'claude',
      // Matches both direct API calls (API-key users) and claude.ai's own
      // backend proxy calls (subscription users who don't use an API key)
      test: url =>
        (url.includes('api.anthropic.com') && url.includes('/v1/messages')) ||
        (url.includes('claude.ai') && url.includes('/completion'))
    },
    {
      platform: 'openai',
      // Covers api.openai.com, chat.openai.com, and chatgpt.com (current domain)
      test: url =>
        (url.includes('api.openai.com') ||
         url.includes('chat.openai.com/backend-api') ||
         url.includes('chatgpt.com/backend-api')) &&
        (url.includes('/chat/completions') || url.includes('/conversation'))
    },
    {
      platform: 'gemini',
      // Matches both :generateContent and :streamGenerateContent variants
      // (the latter has uppercase G so a plain includes('generateContent') misses it)
      test: url =>
        url.includes('generativelanguage.googleapis.com') &&
        (url.includes(':generateContent') || url.includes(':streamGenerateContent'))
    }
  ];

  function detectPlatform(url) {
    for (const m of MATCHERS) {
      if (m.test(url)) return m.platform;
    }
    return null;
  }

  // ── postMessage emitter ───────────────────────────────────────────────────
  function emitUsage(platform, inputTokens, outputTokens) {
    if (typeof inputTokens !== 'number' || inputTokens < 0) return;
    window.postMessage({
      type:         'TOKENLENS_USAGE',
      source:       'intercept',
      platform,
      inputTokens:  Math.floor(inputTokens),
      outputTokens: Math.floor(outputTokens || 0),
      timestamp:    Date.now()
    }, '*');
  }

  // ── SSE stream reader ─────────────────────────────────────────────────────
  async function readSSEStream(body, platform) {
    const reader  = body.getReader();
    const decoder = new TextDecoder();
    const acc     = { inputTokens: 0, outputTokens: 0 };
    let   buffer  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on SSE event boundaries (double newline)
        const events = buffer.split(/\n\n/);
        buffer = events.pop(); // keep incomplete trailing chunk

        for (const event of events) {
          parseSSEEvent(event, platform, acc);
        }
      }
      // Parse any remaining buffer
      if (buffer.trim()) parseSSEEvent(buffer, platform, acc);
    } catch (_) {
      // Stream read errors are non-fatal; emit what we have
    }

    if (acc.inputTokens > 0 || acc.outputTokens > 0) {
      emitUsage(platform, acc.inputTokens, acc.outputTokens);
    }
  }

  function parseSSEEvent(event, platform, acc) {
    const lines = event.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      let data;
      try { data = JSON.parse(jsonStr); } catch (_) { continue; }

      if (platform === 'claude') {
        // message_start carries input token count
        if (data.type === 'message_start' && data.message?.usage?.input_tokens != null) {
          acc.inputTokens = data.message.usage.input_tokens;
        }
        // message_delta carries output token count at end of stream
        if (data.type === 'message_delta' && data.usage?.output_tokens != null) {
          acc.outputTokens = data.usage.output_tokens;
        }
      }

      if (platform === 'openai') {
        // OpenAI sends usage in the final non-DONE chunk
        if (data.usage?.prompt_tokens != null) {
          acc.inputTokens  = data.usage.prompt_tokens;
          acc.outputTokens = data.usage.completion_tokens || 0;
        }
      }

      if (platform === 'gemini') {
        if (data.usageMetadata?.promptTokenCount != null) {
          acc.inputTokens  = data.usageMetadata.promptTokenCount;
          acc.outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        }
      }
    }
  }

  // ── JSON response reader ──────────────────────────────────────────────────
  async function readJSONResponse(clonedResp, platform) {
    try {
      const data = await clonedResp.json();
      let inputTokens = 0, outputTokens = 0;

      if (platform === 'claude') {
        inputTokens  = data.usage?.input_tokens  || 0;
        outputTokens = data.usage?.output_tokens || 0;
      } else if (platform === 'openai') {
        inputTokens  = data.usage?.prompt_tokens     || 0;
        outputTokens = data.usage?.completion_tokens || 0;
      } else if (platform === 'gemini') {
        inputTokens  = data.usageMetadata?.promptTokenCount      || 0;
        outputTokens = data.usageMetadata?.candidatesTokenCount   || 0;
      }

      if (inputTokens > 0 || outputTokens > 0) {
        emitUsage(platform, inputTokens, outputTokens);
      }
    } catch (_) {}
  }

  // ── Fetch wrapper ─────────────────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const url      = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const platform = detectPlatform(url);

    // Non-AI request — pass straight through with no overhead
    if (!platform) return originalFetch(...args);

    const response = await originalFetch(...args);

    // Clone MUST happen synchronously before any await on the original
    try {
      const clone       = response.clone();
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Read streaming response in background — don't block the page
        readSSEStream(clone.body, platform).catch(() => {});
      } else if (contentType.includes('application/json')) {
        readJSONResponse(clone, platform).catch(() => {});
      }
    } catch (_) {
      // Cloning failed or headers unavailable — no-op, DOM estimation is fallback
    }

    return response; // always return the original, unmodified
  };
})();
