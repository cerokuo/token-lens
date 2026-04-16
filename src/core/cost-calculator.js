(function () {
  'use strict';

  // Pricing in USD per 1M tokens — updated April 2026
  const PRICING = {
    claude: {
      'claude-opus-4':    { input: 15,   output: 75,   context: 200000 },
      'claude-sonnet-4':  { input: 3,    output: 15,   context: 200000 },
      'claude-haiku-4':   { input: 0.25, output: 1.25, context: 200000 },
      default:            { input: 3,    output: 15,   context: 200000 }
    },
    openai: {
      'gpt-4o':           { input: 2.5,  output: 10,   context: 128000 },
      'gpt-4o-mini':      { input: 0.15, output: 0.6,  context: 128000 },
      'gpt-4-turbo':      { input: 10,   output: 30,   context: 128000 },
      'o1':               { input: 15,   output: 60,   context: 200000 },
      'o1-mini':          { input: 1.5,  output: 6,    context: 128000 },
      default:            { input: 2.5,  output: 10,   context: 128000 }
    },
    gemini: {
      'gemini-2.0-flash': { input: 0.1,  output: 0.4,  context: 1000000 },
      'gemini-1.5-pro':   { input: 1.25, output: 5,    context: 2000000 },
      'gemini-1.5-flash': { input: 0.075,output: 0.3,  context: 1000000 },
      'gemini-1.0-pro':   { input: 0.5,  output: 1.5,  context: 32000   },
      default:            { input: 0.1,  output: 0.4,  context: 1000000 }
    }
  };

  const CostCalculator = {
    PRICING,

    getModelConfig(platform, model) {
      const table = PRICING[platform];
      if (!table) return null;
      if (table[model]) return table[model];
      // Partial match: "claude-sonnet" matches "claude-sonnet-4"
      const key = Object.keys(table).find(
        k => k !== 'default' && model && model.toLowerCase().includes(k.toLowerCase())
      );
      return table[key] || table.default || null;
    },

    calculateCost(tokens, platform, model, type = 'input') {
      const config = this.getModelConfig(platform, model);
      if (!config) return 0;
      const rate = type === 'output' ? config.output : config.input;
      return (tokens / 1_000_000) * rate;
    },

    calculateSessionCost(inputTokens, outputTokens, platform, model) {
      const inputCost = this.calculateCost(inputTokens, platform, model, 'input');
      const outputCost = this.calculateCost(outputTokens, platform, model, 'output');
      const total = inputCost + outputCost;
      return { input: inputCost, output: outputCost, total, formatted: this.formatCost(total) };
    },

    getContextLimit(platform, model) {
      const config = this.getModelConfig(platform, model);
      return config ? config.context : 128000;
    },

    formatCost(amount) {
      if (amount < 0.0001) return '<$0.0001';
      if (amount < 0.01)   return `$${amount.toFixed(4)}`;
      return `$${amount.toFixed(3)}`;
    }
  };

  if (typeof window !== 'undefined') {
    window.TokenLens = window.TokenLens || {};
    window.TokenLens.CostCalculator = CostCalculator;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CostCalculator;
  }
})();
