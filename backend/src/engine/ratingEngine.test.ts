import { computeRating, generateSummary, Fundamentals } from './ratingEngine';

// A neutral baseline; individual tests override only the fields they care about.
function makeFundamentals(overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    revenue: 1_000_000,
    revenueYoY: 10,
    revenueCagr5Y: 10,
    eps: 5,
    epsYoY: 10,
    netMargin: 10,
    roe: 10,
    roic: 10,
    roicYoY: 0,
    operatingMarginYoY: 0,
    shareCountYoY: 0,
    buybackYield: null,
    ocfToNetIncome: 1,
    intangibleAssetRatio: 0,
    peRatio: 20,
    pegRatio: 1,
    debtToEquity: 0.4,
    currentRatio: 2,
    interestCoverage: 10,
    trajectory: 'steady',
    ...overrides
  };
}

describe('computeRating', () => {
  it('returns five pillars, each clamped to 0..5', () => {
    const { pillars } = computeRating(makeFundamentals());
    for (const v of Object.values(pillars)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
    expect(Object.keys(pillars).sort()).toEqual(
      ['canKeepWinning', 'fairlyPriced', 'growing', 'profitable', 'safe']
    );
  });

  it('rounds the overall score to the nearest half point and stays within 0..5', () => {
    const { overall } = computeRating(makeFundamentals());
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(5);
    expect(overall * 2).toBe(Math.round(overall * 2)); // multiple of 0.5
  });

  it('scores an excellent company near the top', () => {
    const { overall, pillars } = computeRating(makeFundamentals({
      revenueYoY: 40, revenueCagr5Y: 30, trajectory: 'accelerating',
      netMargin: 30, roe: 30, roic: 30,
      pegRatio: 0.8,
      debtToEquity: 0.1, currentRatio: 3, interestCoverage: 50, intangibleAssetRatio: 0,
      roicYoY: 5, operatingMarginYoY: 2, buybackYield: 2
    }));
    expect(pillars.growing).toBeGreaterThanOrEqual(4.5);
    expect(pillars.profitable).toBeGreaterThanOrEqual(4.5);
    expect(pillars.fairlyPriced).toBe(5);
    expect(overall).toBeGreaterThanOrEqual(4.5);
  });

  it('scores a weak, expensive, indebted company low', () => {
    const { overall } = computeRating(makeFundamentals({
      revenueYoY: -10, revenueCagr5Y: -5, trajectory: 'cooling',
      netMargin: 1, roe: 1, roic: 1, ocfToNetIncome: 0.3,
      pegRatio: 4,
      debtToEquity: 3, currentRatio: 0.5, interestCoverage: 0.5, intangibleAssetRatio: 0.6
    }));
    expect(overall).toBeLessThanOrEqual(2.5);
  });

  it('rates a cheap-for-its-growth name (PEG <= 1) a perfect valuation score', () => {
    expect(computeRating(makeFundamentals({ pegRatio: 0.5 })).pillars.fairlyPriced).toBe(5);
    expect(computeRating(makeFundamentals({ pegRatio: 1 })).pillars.fairlyPriced).toBe(5);
  });

  it('penalizes an expensive valuation (high PEG)', () => {
    const cheap = computeRating(makeFundamentals({ pegRatio: 1 })).pillars.fairlyPriced;
    const pricey = computeRating(makeFundamentals({ pegRatio: 3 })).pillars.fairlyPriced;
    expect(pricey).toBeLessThan(cheap);
  });

  it('falls back to the share-count proxy when buyback data is missing', () => {
    const diluting = computeRating(makeFundamentals({ buybackYield: null, shareCountYoY: 8 })).pillars.canKeepWinning;
    const buyingBack = computeRating(makeFundamentals({ buybackYield: null, shareCountYoY: -4 })).pillars.canKeepWinning;
    expect(buyingBack).toBeGreaterThan(diluting);
  });
});

describe('generateSummary', () => {
  it('maps score bands to the right verdict', () => {
    expect(generateSummary(4.8)).toMatch(/Exceptional/i);
    expect(generateSummary(4.0)).toMatch(/High-quality/i);
    expect(generateSummary(3.0)).toMatch(/Mixed/i);
    expect(generateSummary(2.0)).toMatch(/Weak/i);
    expect(generateSummary(1.0)).toMatch(/Significant concerns/i);
  });
});
