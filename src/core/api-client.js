(function () {
  'use strict';

  const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages/count_tokens';
  const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';
  const ANTHROPIC_VER  = '2023-06-01';

  // ── SSE parser (exported for unit testing) ──────────────────────────────
  function parseSSEChunk(chunk, platform, acc) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]' || !jsonStr) continue;

      let data;
      try { data = JSON.parse(jsonStr); } catch (_) { continue; }

      if (platform === 'claude') {
        if (data.type === 'message_start' && data.message?.usage?.input_tokens != null) {
          acc.inputTokens = data.message.usage.input_tokens;
        }
        if (data.type === 'message_delta' && data.usage?.output_tokens != null) {
          acc.outputTokens = data.usage.output_tokens;
        }
      }

      if (platform === 'openai') {
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

  // ── Message format helpers ───────────────────────────────────────────────
  // userMessages and aiMessages arrive as flat string arrays from DOMExtractor.
  // We interleave them: user[0], ai[0], user[1], ai[1], ...
  function interleave(userMessages, aiMessages) {
    const result = [];
    const maxLen = Math.max(userMessages.length, aiMessages.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < userMessages.length && userMessages[i]) {
        result.push({ role: 'user',      content: userMessages[i] });
      }
      if (i < aiMessages.length && aiMessages[i]) {
        result.push({ role: 'assistant', content: aiMessages[i] });
      }
    }
    // Anthropic and Gemini require at least one message
    if (result.length === 0) {
      result.push({ role: 'user', content: ' ' });
    }
    return result;
  }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  async function countTokensClaude(messages, model, apiKey) {
    // Anthropic requires at least one message
    const safeMessages = (messages && messages.length > 0)
      ? messages
      : [{ role: 'user', content: ' ' }];

    // Normalise model ID — Anthropic needs the full model string
    const modelId = model.includes('claude') ? model : `claude-${model}`;

    const resp = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: {
        'x-api-key':          apiKey,
        'anthropic-version':  ANTHROPIC_VER,
        'content-type':       'application/json'
      },
      body: JSON.stringify({ model: modelId, messages: safeMessages })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`Anthropic API error ${resp.status}: ${err?.error?.message || 'unknown'}`);
    }

    const data = await resp.json();
    return { inputTokens: data.input_tokens, outputTokens: 0 };
  }

  // ── Gemini ────────────────────────────────────────────────────────────────
  async function countTokensGemini(contents, model, apiKey) {
    // contents must be in Gemini format: [{ role, parts: [{ text }] }]
    const url = `${GEMINI_BASE}/${model}:countTokens?key=${apiKey}`;

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ contents })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`Gemini API error ${resp.status}: ${err?.error?.message || 'unknown'}`);
    }

    const data = await resp.json();
    return { inputTokens: data.totalTokens, outputTokens: 0 };
  }

  // Convert interleaved messages to Gemini contents format
  function toGeminiContents(messages) {
    return messages.map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || ' ' }]
    }));
  }

  // ── Main dispatcher ───────────────────────────────────────────────────────
  async function countTokens(platform, userMessages, aiMessages, model, apiKey) {
    if (platform === 'openai') return null;  // No count_tokens endpoint; intercept handles it
    if (!platform || !apiKey) return null;

    const interleaved = interleave(
      Array.isArray(userMessages) ? userMessages : [],
      Array.isArray(aiMessages)   ? aiMessages   : []
    );

    if (platform === 'claude') {
      return countTokensClaude(interleaved, model, apiKey);
    }

    if (platform === 'gemini') {
      return countTokensGemini(toGeminiContents(interleaved), model, apiKey);
    }

    return null; // unknown platform
  }

  const ApiClient = {
    countTokens,
    countTokensClaude,
    countTokensGemini,
    parseSSEChunk   // exported for unit tests
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.ApiClient = ApiClient;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
  }
})();
