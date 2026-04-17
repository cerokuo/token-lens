/**
 * @jest-environment jsdom
 */

// dom-extractor.js exports via window.TokenLens and module.exports (dual pattern)
const DOMExtractor = require('../src/content/dom-extractor');

// ── Helpers ───────────────────────────────────────────────────────────────────
function setBody(html) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ── Claude ────────────────────────────────────────────────────────────────────
describe('DOMExtractor.extractMessages — Claude', () => {
  it('extracts user messages via data-testid="user-message"', () => {
    setBody(`
      <main>
        <div data-testid="user-message">Hello world</div>
        <div data-testid="user-message">Second question</div>
      </main>
    `);
    const { userMessages } = DOMExtractor.extractMessages('claude');
    expect(userMessages).toEqual(['Hello world', 'Second question']);
  });

  it('extracts AI messages via data-testid="assistant-message"', () => {
    setBody(`
      <main>
        <div data-testid="assistant-message">This is the AI reply</div>
      </main>
    `);
    const { aiMessages } = DOMExtractor.extractMessages('claude');
    expect(aiMessages).toEqual(['This is the AI reply']);
  });

  it('falls through to .font-claude-message when testid is absent', () => {
    setBody(`
      <main>
        <div class="font-claude-message">Fallback AI message</div>
      </main>
    `);
    const { aiMessages } = DOMExtractor.extractMessages('claude');
    expect(aiMessages).toEqual(['Fallback AI message']);
  });

  it('skips selectors that match only empty elements and tries next', () => {
    // The first selector matches but all matched elements are empty containers.
    // The extractor must skip to the next selector that has actual text.
    setBody(`
      <main>
        <div data-testid="assistant-message"></div>
        <div data-testid="assistant-message">  </div>
        <div class="prose"><p>Real AI paragraph</p></div>
      </main>
    `);
    const { aiMessages } = DOMExtractor.extractMessages('claude');
    expect(aiMessages.length).toBeGreaterThan(0);
    expect(aiMessages.join(' ')).toContain('Real AI paragraph');
  });

  it('returns AI messages from .prose p when no specific testid matches', () => {
    setBody(`
      <main>
        <div class="prose">
          <p>First paragraph of the AI response</p>
          <p>Second paragraph</p>
        </div>
      </main>
    `);
    const { aiMessages } = DOMExtractor.extractMessages('claude');
    expect(aiMessages.length).toBeGreaterThan(0);
    expect(aiMessages.join(' ')).toContain('First paragraph');
  });

  it('does not include user-message text in aiMessages', () => {
    setBody(`
      <main>
        <div data-testid="user-message">User asked this</div>
        <div data-testid="assistant-message">AI answered this</div>
      </main>
    `);
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('claude');
    expect(userMessages).toContain('User asked this');
    expect(aiMessages).toContain('AI answered this');
    expect(aiMessages).not.toContain('User asked this');
  });

  it('returns empty arrays when no messages are present', () => {
    setBody('<main></main>');
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('claude');
    expect(userMessages).toEqual([]);
    expect(aiMessages).toEqual([]);
  });

  it('handles multiple AI messages in sequence', () => {
    setBody(`
      <main>
        <div data-testid="assistant-message">First reply</div>
        <div data-testid="assistant-message">Second reply</div>
        <div data-testid="assistant-message">Third reply</div>
      </main>
    `);
    const { aiMessages } = DOMExtractor.extractMessages('claude');
    expect(aiMessages.length).toBe(3);
    expect(aiMessages[0]).toBe('First reply');
    expect(aiMessages[2]).toBe('Third reply');
  });
});

// ── OpenAI ────────────────────────────────────────────────────────────────────
describe('DOMExtractor.extractMessages — OpenAI', () => {
  it('extracts user and AI messages via data-message-author-role', () => {
    setBody(`
      <main>
        <div data-message-author-role="user">
          <div class="text-message">My question</div>
        </div>
        <div data-message-author-role="assistant">
          <div class="text-message">ChatGPT reply</div>
        </div>
      </main>
    `);
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('openai');
    expect(userMessages.join(' ')).toContain('My question');
    expect(aiMessages.join(' ')).toContain('ChatGPT reply');
  });

  it('falls through to the role container itself when .text-message absent', () => {
    setBody(`
      <main>
        <div data-message-author-role="user">Direct user text</div>
        <div data-message-author-role="assistant">Direct AI text</div>
      </main>
    `);
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('openai');
    expect(userMessages.join(' ')).toContain('Direct user text');
    expect(aiMessages.join(' ')).toContain('Direct AI text');
  });
});

// ── Gemini ────────────────────────────────────────────────────────────────────
describe('DOMExtractor.extractMessages — Gemini', () => {
  it('extracts user and AI messages from Gemini structure', () => {
    setBody(`
      <main>
        <user-query>
          <div class="query-text">Gemini user question</div>
        </user-query>
        <model-response>
          <div class="response-content"><p>Gemini AI answer</p></div>
        </model-response>
      </main>
    `);
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('gemini');
    expect(userMessages.join(' ')).toContain('Gemini user question');
    expect(aiMessages.join(' ')).toContain('Gemini AI answer');
  });
});

// ── Unknown platform ──────────────────────────────────────────────────────────
describe('DOMExtractor.extractMessages — unknown platform', () => {
  it('returns empty arrays for unsupported platform', () => {
    setBody('<div>Some content</div>');
    const { userMessages, aiMessages } = DOMExtractor.extractMessages('unknown');
    expect(userMessages).toEqual([]);
    expect(aiMessages).toEqual([]);
  });
});

// ── queryAll fallback behaviour ───────────────────────────────────────────────
describe('DOMExtractor.queryAll — skip-empty-text logic', () => {
  it('skips a selector if all matched elements are blank, tries next', () => {
    setBody(`
      <div class="first-selector">   </div>
      <div class="second-selector">Has content</div>
    `);
    // first-selector matches but is blank; second-selector should be reached
    const results = DOMExtractor.queryAll(['.first-selector', '.second-selector']);
    const texts = results.map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
    expect(texts).toContain('Has content');
  });
});
