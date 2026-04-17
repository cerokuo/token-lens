// Tests for injected.js URL matching and SSE parsing logic.
// Both functions are extracted inline (same logic as in injected.js) because
// injected.js runs in MAIN world and isn't importable directly.
// These tests lock down the behaviour so regressions are caught immediately.

// ── URL matcher (mirrors MATCHERS in injected.js) ─────────────────────────────
const MATCHERS = [
  {
    platform: 'claude',
    test: url =>
      (url.includes('api.anthropic.com') && url.includes('/v1/messages')) ||
      (url.includes('claude.ai') && url.includes('/completion'))
  },
  {
    platform: 'openai',
    test: url =>
      (url.includes('api.openai.com') ||
       url.includes('chat.openai.com/backend-api') ||
       url.includes('chatgpt.com/backend-api')) &&
      (url.includes('/chat/completions') || url.includes('/conversation'))
  },
  {
    platform: 'gemini',
    test: url =>
      url.includes('generativelanguage.googleapis.com') &&
      (url.includes(':generateContent') || url.includes(':streamGenerateContent'))
  }
];

function detectPlatform(url) {
  for (const m of MATCHERS) if (m.test(url)) return m.platform;
  return null;
}

// ── SSE parser (mirrors parseSSEEvent in injected.js) ─────────────────────────
function parseSSEEvent(event, platform, acc) {
  const lines = event.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

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

// ── URL matching tests ────────────────────────────────────────────────────────
describe('detectPlatform — Claude', () => {
  it('matches direct Anthropic API calls', () => {
    expect(detectPlatform('https://api.anthropic.com/v1/messages')).toBe('claude');
  });

  it('matches claude.ai frontend completion endpoint', () => {
    expect(detectPlatform(
      'https://claude.ai/api/organizations/abc123/chat_conversations/xyz/completion'
    )).toBe('claude');
  });

  it('does not match unrelated claude.ai pages', () => {
    expect(detectPlatform('https://claude.ai/new')).toBeNull();
    expect(detectPlatform('https://claude.ai/settings')).toBeNull();
  });
});

describe('detectPlatform — OpenAI', () => {
  it('matches api.openai.com chat completions', () => {
    expect(detectPlatform('https://api.openai.com/v1/chat/completions')).toBe('openai');
  });

  it('matches chatgpt.com backend-api conversation endpoint', () => {
    expect(detectPlatform('https://chatgpt.com/backend-api/conversation')).toBe('openai');
  });

  it('matches chat.openai.com backend-api', () => {
    expect(detectPlatform('https://chat.openai.com/backend-api/chat/completions')).toBe('openai');
  });
});

describe('detectPlatform — Gemini', () => {
  it('matches Gemini generateContent endpoint', () => {
    expect(detectPlatform(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    )).toBe('gemini');
  });

  it('matches Gemini streamGenerateContent', () => {
    expect(detectPlatform(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=abc'
    )).toBe('gemini');
  });
});

describe('detectPlatform — unknown', () => {
  it('returns null for unrelated URLs', () => {
    expect(detectPlatform('https://google.com')).toBeNull();
    expect(detectPlatform('https://github.com')).toBeNull();
    expect(detectPlatform('')).toBeNull();
  });
});

// ── SSE parsing tests ─────────────────────────────────────────────────────────
describe('parseSSEEvent — Claude', () => {
  it('extracts inputTokens from message_start', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: 42, output_tokens: 1 } }
    })}`;
    parseSSEEvent(event, 'claude', acc);
    expect(acc.inputTokens).toBe(42);
  });

  it('extracts outputTokens from message_delta', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({
      type: 'message_delta',
      usage: { output_tokens: 128 }
    })}`;
    parseSSEEvent(event, 'claude', acc);
    expect(acc.outputTokens).toBe(128);
  });

  it('ignores unrelated event types', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'hello' } })}`;
    parseSSEEvent(event, 'claude', acc);
    expect(acc.inputTokens).toBe(0);
    expect(acc.outputTokens).toBe(0);
  });

  it('accumulates both tokens across a multi-event stream', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    parseSSEEvent(
      `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 200 } } })}`,
      'claude', acc
    );
    parseSSEEvent(
      `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 85 } })}`,
      'claude', acc
    );
    expect(acc.inputTokens).toBe(200);
    expect(acc.outputTokens).toBe(85);
  });
});

describe('parseSSEEvent — OpenAI', () => {
  it('extracts both token counts from the usage chunk', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({
      usage: { prompt_tokens: 100, completion_tokens: 55 }
    })}`;
    parseSSEEvent(event, 'openai', acc);
    expect(acc.inputTokens).toBe(100);
    expect(acc.outputTokens).toBe(55);
  });

  it('handles missing completion_tokens gracefully', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({ usage: { prompt_tokens: 80 } })}`;
    parseSSEEvent(event, 'openai', acc);
    expect(acc.inputTokens).toBe(80);
    expect(acc.outputTokens).toBe(0);
  });

  it('ignores [DONE] sentinel without throwing', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    expect(() => parseSSEEvent('data: [DONE]', 'openai', acc)).not.toThrow();
    expect(acc.inputTokens).toBe(0);
  });
});

describe('parseSSEEvent — Gemini', () => {
  it('extracts token counts from usageMetadata', () => {
    const acc = { inputTokens: 0, outputTokens: 0 };
    const event = `data: ${JSON.stringify({
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 120 }
    })}`;
    parseSSEEvent(event, 'gemini', acc);
    expect(acc.inputTokens).toBe(300);
    expect(acc.outputTokens).toBe(120);
  });
});
