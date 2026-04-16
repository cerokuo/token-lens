const CostCalculator = require('../src/core/cost-calculator');

describe('CostCalculator', () => {
  describe('calculateCost', () => {
    it('calculates Claude Sonnet input cost correctly', () => {
      // $3 per 1M tokens → 1000 tokens = $0.003
      const result = CostCalculator.calculateCost(1000, 'claude', 'claude-sonnet-4', 'input');
      expect(result).toBeCloseTo(0.003, 5);
    });

    it('calculates Claude Sonnet output cost correctly', () => {
      // $15 per 1M tokens → 1000 tokens = $0.015
      const result = CostCalculator.calculateCost(1000, 'claude', 'claude-sonnet-4', 'output');
      expect(result).toBeCloseTo(0.015, 5);
    });

    it('calculates GPT-4o input cost correctly', () => {
      // $2.50 per 1M tokens → 1000 tokens = $0.0025
      const result = CostCalculator.calculateCost(1000, 'openai', 'gpt-4o', 'input');
      expect(result).toBeCloseTo(0.0025, 5);
    });

    it('calculates Gemini 2.0 Flash input cost correctly', () => {
      // $0.10 per 1M tokens → 1000 tokens = $0.0001
      const result = CostCalculator.calculateCost(1000, 'gemini', 'gemini-2.0-flash', 'input');
      expect(result).toBeCloseTo(0.0001, 6);
    });

    it('returns 0 for unknown platform', () => {
      expect(CostCalculator.calculateCost(1000, 'unknown', 'unknown-model', 'input')).toBe(0);
    });

    it('defaults to input pricing when type not specified', () => {
      const withType = CostCalculator.calculateCost(1000, 'claude', 'claude-sonnet-4', 'input');
      const withoutType = CostCalculator.calculateCost(1000, 'claude', 'claude-sonnet-4');
      expect(withType).toBe(withoutType);
    });

    it('handles partial model name matching', () => {
      // "claude-sonnet" should match "claude-sonnet-4"
      const result = CostCalculator.calculateCost(1000, 'claude', 'claude-sonnet', 'input');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('calculateSessionCost', () => {
    it('returns cost breakdown with input, output, total, and formatted', () => {
      const result = CostCalculator.calculateSessionCost(1000, 500, 'claude', 'claude-sonnet-4');
      expect(result).toHaveProperty('input');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('formatted');
    });

    it('total equals input + output', () => {
      const result = CostCalculator.calculateSessionCost(1000, 500, 'openai', 'gpt-4o');
      expect(result.total).toBeCloseTo(result.input + result.output, 8);
    });

    it('formatted string starts with $', () => {
      const result = CostCalculator.calculateSessionCost(1000, 500, 'claude', 'claude-sonnet-4');
      expect(result.formatted).toMatch(/^\$/);
    });
  });

  describe('getContextLimit', () => {
    it('returns 200000 for Claude Sonnet', () => {
      expect(CostCalculator.getContextLimit('claude', 'claude-sonnet-4')).toBe(200000);
    });

    it('returns 128000 for GPT-4o', () => {
      expect(CostCalculator.getContextLimit('openai', 'gpt-4o')).toBe(128000);
    });

    it('returns 1000000 for Gemini 2.0 Flash', () => {
      expect(CostCalculator.getContextLimit('gemini', 'gemini-2.0-flash')).toBe(1000000);
    });

    it('returns a fallback for unknown model', () => {
      const limit = CostCalculator.getContextLimit('openai', 'unknown-model');
      expect(limit).toBeGreaterThan(0);
    });
  });

  describe('formatCost', () => {
    it('shows <$0.0001 for very small costs', () => {
      expect(CostCalculator.formatCost(0.00001)).toBe('<$0.0001');
    });

    it('shows 4 decimals for small costs', () => {
      expect(CostCalculator.formatCost(0.0025)).toBe('$0.0025');
    });

    it('shows 3 decimals for larger costs', () => {
      expect(CostCalculator.formatCost(0.15)).toBe('$0.150');
    });
  });
});
