(function () {
  'use strict';

  // Multiple selectors per slot, tried in order — AI chat UIs change frequently
  const SELECTORS = {
    claude: {
      userMessages: [
        '[data-testid="user-message"]',
        '.font-user-message',
        '[class*="human-turn"] p',
        '[class*="HumanTurn"] p',
        // Broader fallbacks for newer Claude.ai builds
        '[class*="Human"] .whitespace-pre-wrap',
        '.whitespace-pre-wrap[class*="user"]',
        '[data-message-author-role="user"]',
        '[class*="rounded-3xl"] .whitespace-pre-wrap'
      ],
      aiMessages: [
        '[data-testid="assistant-message"]',
        '.font-claude-message',
        '[class*="assistant-message"] p',
        '[class*="AssistantMessage"] p',
        // Broader fallbacks — Claude.ai renders AI output as markdown prose
        '.prose p',
        '[class*="prose"] p',
        '[data-message-author-role="assistant"] p',
        '[class*="Claude"] .whitespace-pre-wrap',
        '[class*="Assistant"] .whitespace-pre-wrap',
        // Final catch-all: any paragraph inside main that isn't user input
        'main .prose'
      ],
      input: [
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]',
        '#prompt-textarea'
      ],
      // Cast a wide net — Claude's model selector UI shifts with each deploy
      modelSelector: [
        '[data-testid="model-selector-dropdown"] button',
        '[data-testid="model-selector"] button',
        'button[data-testid*="model"]',
        '[aria-label*="model" i]',
        'button[class*="ModelSelector"]',
        'button[class*="model-selector"]',
        // Claude often puts model name in a span inside a header button
        'header button span',
        'nav button span',
        '[role="combobox"][aria-label*="model" i]'
      ],
      // Container to observe for new messages being added
      conversationContainer: [
        '[data-testid="conversation-turn-list"]',
        '[class*="ConversationList"]',
        'main [class*="overflow-y-auto"]',
        'main'
      ]
    },
    openai: {
      userMessages: [
        '[data-message-author-role="user"] .text-message',
        '[data-message-author-role="user"]'
      ],
      aiMessages: [
        '[data-message-author-role="assistant"] .text-message',
        '[data-message-author-role="assistant"]'
      ],
      input: [
        '#prompt-textarea',
        'div[contenteditable="true"]'
      ],
      modelSelector: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[class*="model"]',
        '[aria-label*="model" i]'
      ],
      conversationContainer: [
        '[data-testid="conversation-turns"]',
        'main .flex-col',
        'main'
      ]
    },
    gemini: {
      userMessages: [
        '.user-query-text',
        'user-query .query-text',
        '[class*="user-query"] p'
      ],
      aiMessages: [
        '.model-response-text',
        'model-response .response-content',
        '[class*="response-content"] p'
      ],
      input: [
        'rich-textarea .ql-editor',
        '.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"]'
      ],
      modelSelector: [
        '[data-test-id="model-selector"]',
        'bard-mode-switcher button',
        '[aria-label*="model" i]'
      ],
      conversationContainer: [
        'chat-history',
        '.conversation-container',
        'main'
      ]
    }
  };

  const MODEL_PATTERNS = [
    { pattern: /opus/i,       model: 'claude-opus-4'      },
    { pattern: /sonnet/i,     model: 'claude-sonnet-4'    },
    { pattern: /haiku/i,      model: 'claude-haiku-4'     },
    { pattern: /gpt-4o-mini/i,model: 'gpt-4o-mini'        },
    { pattern: /gpt-4o/i,     model: 'gpt-4o'             },
    { pattern: /o1-mini/i,    model: 'o1-mini'            },
    { pattern: /\bo1\b/i,     model: 'o1'                 },
    { pattern: /1\.5 pro/i,   model: 'gemini-1.5-pro'     },
    { pattern: /1\.5 flash/i, model: 'gemini-1.5-flash'   },
    { pattern: /2\.0/i,       model: 'gemini-2.0-flash'   }
  ];

  const PLATFORM_DEFAULTS = {
    claude: 'claude-sonnet-4',
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash'
  };

  const DOMExtractor = {
    SELECTORS,

    queryFirst(selectors) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (_) {}
      }
      return null;
    },

    queryAll(selectors) {
      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) return Array.from(els);
        } catch (_) {}
      }
      return [];
    },

    extractMessages(platform) {
      const sels = SELECTORS[platform];
      if (!sels) return { userMessages: [], aiMessages: [] };

      const getText = el => (el.innerText || el.textContent || '').trim();
      return {
        userMessages: this.queryAll(sels.userMessages).map(getText).filter(Boolean),
        aiMessages:   this.queryAll(sels.aiMessages).map(getText).filter(Boolean)
      };
    },

    getCurrentInput(platform) {
      const sels = SELECTORS[platform];
      if (!sels) return '';
      const el = this.queryFirst(sels.input);
      return el ? (el.value || el.innerText || el.textContent || '').trim() : '';
    },

    detectModel(platform) {
      if (platform !== 'claude') {
        // For OpenAI / Gemini keep the original single-pass approach
        const sels = SELECTORS[platform];
        if (!sels) return PLATFORM_DEFAULTS[platform];
        const el = this.queryFirst(sels.modelSelector);
        if (el) {
          const label = el.innerText || el.textContent || el.getAttribute('aria-label') || '';
          for (const { pattern, model } of MODEL_PATTERNS) {
            if (pattern.test(label)) return model;
          }
        }
        return PLATFORM_DEFAULTS[platform];
      }

      // ── Claude-specific model detection ────────────────────────────────
      // 1. Try every model selector candidate
      const claudeSels = SELECTORS.claude.modelSelector;
      for (const sel of claudeSels) {
        try {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
            if (!text) continue;
            for (const { pattern, model } of MODEL_PATTERNS) {
              if (pattern.test(text)) return model;
            }
          }
        } catch (_) {}
      }

      // 2. Scan all buttons / spans in header / nav for model name text
      const scanTargets = document.querySelectorAll('header *, nav *, [role="banner"] *');
      for (const el of scanTargets) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text.length > 40) continue; // skip long blocks
        for (const { pattern, model } of MODEL_PATTERNS) {
          if (pattern.test(text)) return model;
        }
      }

      // 3. Check document title — Claude sometimes sets it to the model name
      for (const { pattern, model } of MODEL_PATTERNS) {
        if (pattern.test(document.title)) return model;
      }

      return PLATFORM_DEFAULTS.claude;
    },

    // Returns the raw DOM input element (for attaching event listeners)
    getInputElement(platform) {
      const sels = SELECTORS[platform];
      return sels ? this.queryFirst(sels.input) : null;
    },

    // Returns the conversation scroll container (for MutationObserver)
    getConversationContainer(platform) {
      const sels = SELECTORS[platform];
      return sels ? this.queryFirst(sels.conversationContainer) : null;
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.DOMExtractor = DOMExtractor;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMExtractor;
  }
})();
