global.fetch = jest.fn();

const ApiClient = require('../src/core/api-client');

beforeEach(() => jest.clearAllMocks());

// ── Helpers ────────────────────────────────────────────────────────────────
function mockFetchOk(body) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body
  });
}

function mockFetchError(status, body = {}) {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body
  });
}

// ── Claude (Anthropic) ─────────────────────────────────────────────────────
describe('ApiClient.countTokensClaude', () => {
  const messages = [{ role: 'user', content: 'Hello' }];
  const apiKey = 'sk-ant-test';
  const model  = 'claude-sonnet-4';

  it('calls the correct Anthropic endpoint', async () => {
    mockFetchOk({ input_tokens: 5 });
    await ApiClient.countTokensClaude(messages, model, apiKey);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages/count_tokens',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends x-api-key header', async () => {
    mockFetchOk({ input_tokens: 5 });
    await ApiClient.countTokensClaude(messages, model, apiKey);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['x-api-key']).toBe(apiKey);
  });

  it('sends anthropic-version header', async () => {
    mockFetchOk({ input_tokens: 5 });
    await ApiClient.countTokensClaude(messages, model, apiKey);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['anthropic-version']).toBeDefined();
  });

  it('sends model and messages in body', async () => {
    mockFetchOk({ input_tokens: 5 });
    await ApiClient.countTokensClaude(messages, model, apiKey);
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.model).toContain('claude');
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('returns inputTokens from response', async () => {
    mockFetchOk({ input_tokens: 42 });
    const result = await ApiClient.countTokensClaude(messages, model, apiKey);
    expect(result.inputTokens).toBe(42);
  });

  it('throws on HTTP 401 (invalid key)', async () => {
    mockFetchError(401, { error: { message: 'Invalid API key' } });
    await expect(ApiClient.countTokensClaude(messages, model, apiKey)).rejects.toThrow();
  });

  it('throws on HTTP 429 (rate limit)', async () => {
    mockFetchError(429, { error: { message: 'Rate limit exceeded' } });
    await expect(ApiClient.countTokensClaude(messages, model, apiKey)).rejects.toThrow();
  });

  it('sends at least one message even for empty input', async () => {
    mockFetchOk({ input_tokens: 1 });
    await ApiClient.countTokensClaude([], model, apiKey);
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.messages.length).toBeGreaterThan(0);
  });
});

// ── Gemini ─────────────────────────────────────────────────────────────────
describe('ApiClient.countTokensGemini', () => {
  const contents = [{ role: 'user', parts: [{ text: 'Hello' }] }];
  const apiKey   = 'AIza-test';
  const model    = 'gemini-2.0-flash';

  it('calls the correct Gemini endpoint with key in query string', async () => {
    mockFetchOk({ totalTokens: 3 });
    await ApiClient.countTokensGemini(contents, model, apiKey);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain(`key=${apiKey}`);
  });

  it('includes the model name in the URL', async () => {
    mockFetchOk({ totalTokens: 3 });
    await ApiClient.countTokensGemini(contents, model, apiKey);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain(model);
  });

  it('returns inputTokens from totalTokens', async () => {
    mockFetchOk({ totalTokens: 17 });
    const result = await ApiClient.countTokensGemini(contents, model, apiKey);
    expect(result.inputTokens).toBe(17);
  });

  it('throws on HTTP 400 (bad request)', async () => {
    mockFetchError(400, { error: { message: 'Invalid contents' } });
    await expect(ApiClient.countTokensGemini(contents, model, apiKey)).rejects.toThrow();
  });
});

// ── Dispatcher ─────────────────────────────────────────────────────────────
describe('ApiClient.countTokens (dispatcher)', () => {
  const userMessages = ['Hello there'];
  const aiMessages   = ['Hi! How can I help?'];
  const model        = 'claude-sonnet-4';
  const apiKey       = 'sk-ant-test';

  it('returns null for openai without calling fetch', async () => {
    const result = await ApiClient.countTokens('openai', userMessages, aiMessages, model, apiKey);
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls countTokensClaude for claude platform', async () => {
    mockFetchOk({ input_tokens: 10 });
    const result = await ApiClient.countTokens('claude', userMessages, aiMessages, model, apiKey);
    expect(result).not.toBeNull();
    expect(global.fetch).toHaveBeenCalled();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('anthropic.com');
  });

  it('calls countTokensGemini for gemini platform', async () => {
    mockFetchOk({ totalTokens: 8 });
    const result = await ApiClient.countTokens('gemini', userMessages, aiMessages, 'gemini-2.0-flash', 'AIza-test');
    expect(result).not.toBeNull();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('googleapis.com');
  });

  it('interleaves user and AI messages correctly', async () => {
    mockFetchOk({ input_tokens: 20 });
    await ApiClient.countTokens('claude', ['user1', 'user2'], ['ai1'], model, apiKey);
    const [, opts] = global.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    const roles = body.messages.map(m => m.role);
    // Should alternate: user, assistant, user (or similar valid ordering)
    expect(roles[0]).toBe('user');
  });

  it('returns null for unknown platform', async () => {
    const result = await ApiClient.countTokens('unknown', userMessages, aiMessages, model, apiKey);
    expect(result).toBeNull();
  });
});

// ── SSE parser (pure function, extracted for testability) ─────────────────
describe('ApiClient.parseSSEChunk', () => {
  it('extracts input_tokens from Claude message_start event', () => {
    const chunk = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":25}}}\n\n';
    const acc = { inputTokens: 0, outputTokens: 0 };
    ApiClient.parseSSEChunk(chunk, 'claude', acc);
    expect(acc.inputTokens).toBe(25);
  });

  it('extracts output_tokens from Claude message_delta event', () => {
    const chunk = 'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":40}}\n\n';
    const acc = { inputTokens: 25, outputTokens: 0 };
    ApiClient.parseSSEChunk(chunk, 'claude', acc);
    expect(acc.outputTokens).toBe(40);
  });

  it('extracts usage from OpenAI final chunk', () => {
    const chunk = 'data: {"id":"x","model":"gpt-4o","usage":{"prompt_tokens":10,"completion_tokens":20}}\n\n';
    const acc = { inputTokens: 0, outputTokens: 0 };
    ApiClient.parseSSEChunk(chunk, 'openai', acc);
    expect(acc.inputTokens).toBe(10);
    expect(acc.outputTokens).toBe(20);
  });

  it('ignores [DONE] sentinel without throwing', () => {
    const chunk = 'data: [DONE]\n\n';
    const acc = { inputTokens: 5, outputTokens: 3 };
    expect(() => ApiClient.parseSSEChunk(chunk, 'openai', acc)).not.toThrow();
    // Values unchanged
    expect(acc.inputTokens).toBe(5);
    expect(acc.outputTokens).toBe(3);
  });

  it('silently skips malformed JSON', () => {
    const chunk = 'data: {not valid json!!!\n\n';
    const acc = { inputTokens: 0, outputTokens: 0 };
    expect(() => ApiClient.parseSSEChunk(chunk, 'claude', acc)).not.toThrow();
  });
});
