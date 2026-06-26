/**
 * Rating Engine - 5-Pillar Fundamental Analysis
 *
 * Computes scores for:
 * 1. Growing - Revenue & EPS YoY trend
 * 2. Profitable - Margins & ROE
 * 3. Fairly Priced - Valuation ratios
 * 4. Resilient - Balance sheet strength (internal key: `safe`)
 * 5. Can Keep Winning - Competitive moat
 */

export interface Fundamentals {
  revenue: number;
  revenueYoY: number; // %
  revenueCagr5Y: number; // %
  eps: number;
  epsYoY: number; // %
  netMargin: number; // %
  roe: number; // %
  roic: number; // %
  roicYoY: number; // pts, change in ROIC vs a year ago - is the moat strengthening or eroding?
  operatingMarginYoY: number; // pts, change in operating margin vs a year ago
  shareCountYoY: number; // %, diluted share count change - fallback capital-allocation proxy when real buyback data is unavailable
  buybackYield: number | null; // %, TTM buybacks / market cap from SEC EDGAR - null when EDGAR has no data for this company
  ocfToNetIncome: number; // cash conversion ratio - does cash flow confirm reported profit, or is it all accruals?
  intangibleAssetRatio: number; // intangible/goodwill assets as a fraction of total assets
  peRatio: number;
  pegRatio: number;
  debtToEquity: number; // net-of-cash when EDGAR cash data is available, otherwise gross debt/equity
  currentRatio: number;
  interestCoverage: number;
  trajectory: 'accelerating' | 'steady' | 'cooling';
}

interface PillarScores {
  growing: number;
  profitable: number;
  fairlyPriced: number;
  safe: number;
  canKeepWinning: number;
}

export interface RatingResult {
  overall: number; // 0-5
  pillars: PillarScores;
  summary: string;
}

export function computeRating(fundamentals: Fundamentals): RatingResult {
  const pillars: PillarScores = {
    growing: scoreGrowing(fundamentals),
    profitable: scoreProfitable(fundamentals),
    fairlyPriced: scoreFairlyPriced(fundamentals),
    safe: scoreSafe(fundamentals),
    canKeepWinning: scoreCanKeepWinning(fundamentals),
  };

  const overall = Math.round(
    (pillars.growing + pillars.profitable + pillars.fairlyPriced + pillars.safe + pillars.canKeepWinning) / 5 * 2
  ) / 2;

  return {
    overall,
    pillars,
    summary: generateSummary(overall),
  };
}

function scoreGrowing(f: Fundamentals): number {
  // YoY growth + CAGR + trajectory
  const growthScore = Math.min(f.revenueYoY / 30 * 5, 5); // 30% YoY = 5.0
  const calmScore = Math.min(f.revenueCagr5Y / 25 * 5, 5); // 25% CAGR = 5.0
  let trajectoryBoost = 0;
  if (f.trajectory === 'accelerating') trajectoryBoost = 0.5;
  if (f.trajectory === 'cooling') trajectoryBoost = -0.5;

  return Math.max(0, Math.min(5, (growthScore + calmScore) / 2 + trajectoryBoost));
}

function scoreProfitable(f: Fundamentals): number {
  // Net margin + ROE + ROIC
  const marginScore = Math.min(f.netMargin / 20 * 5, 5); // 20% = 5.0
  const roeScore = Math.min(f.roe / 20 * 5, 5); // 20% = 5.0
  const roicScore = Math.min(f.roic / 15 * 5, 5); // 15% = 5.0

  // Earnings quality: does cash flow confirm the reported profit, or is it
  // mostly accruals? OCF/NetIncome >= 1 is healthy; well below 1 is a red
  // flag regardless of how good the accounting margin looks
  const qualityScore = Math.max(0, Math.min(5, f.ocfToNetIncome * 5));

  return Math.max(0, Math.min(5, (marginScore + roeScore + roicScore + qualityScore) / 4));
}

function scoreFairlyPriced(f: Fundamentals): number {
  // PEG normalizes P/E by the company's own growth rate, so it works across
  // sectors without needing a sector-median P/E benchmark we don't have data
  // for, and correctly rewards a high P/E when growth justifies it (e.g.
  // PE=40 with 80% growth -> PEG=0.5, excellent). No absolute-P/E penalty:
  // that would just contradict PEG's own logic for genuine high-growth cases.
  return f.pegRatio <= 1 ? 5 : Math.max(0, Math.min(5, 5 - (f.pegRatio - 1) * 2.5));
}

function scoreSafe(f: Fundamentals): number {
  // Debt/equity (net of cash when EDGAR data is available - a net cash
  // position scores above 5 here, clamped) + current ratio + interest coverage
  const deScore = f.debtToEquity < 0.5 ? 5 : Math.max(0, 5 - f.debtToEquity * 5);
  const crScore = f.currentRatio > 1.5 ? 5 : Math.max(0, f.currentRatio / 1.5 * 5);
  const icScore = f.interestCoverage > 5 ? 5 : Math.max(0, f.interestCoverage);

  // Asset quality: a balance sheet that's mostly goodwill/intangibles (often
  // from overpaying for acquisitions) is riskier than one built on hard
  // assets, even at the same debt ratios
  const intangibleScore = Math.max(0, 5 - f.intangibleAssetRatio * 10); // 50% intangible-heavy -> 0

  return Math.max(0, Math.min(5, (deScore + crScore + icScore + intangibleScore) / 4));
}

function scoreCanKeepWinning(f: Fundamentals): number {
  // Moat proxy, deliberately independent of the inputs already scored in
  // Profitable/Fairly Priced: is the business sustaining/improving its
  // returns and pricing power over time, and is management allocating
  // capital like an owner (buybacks) or diluting holders (stock comp)?
  const roicLevel = Math.max(0, Math.min(5, f.roic / 15 * 5));
  const roicTrendAdj = f.roicYoY >= 0 ? 0.5 : -0.5;
  const roicComponent = Math.max(0, Math.min(5, roicLevel + roicTrendAdj));

  // Each 1pt of operating margin change vs a year ago moves this 1 point;
  // flat margin scores at the midpoint
  const marginTrendComponent = Math.max(0, Math.min(5, 2.5 + f.operatingMarginYoY));

  // Capital allocation: prefer real buyback spend from SEC EDGAR (buyback
  // yield vs market cap) when available; fall back to the diluted-share-count
  // proxy for companies EDGAR has no data for (e.g. some foreign filers)
  const capitalAllocationComponent = f.buybackYield !== null
    ? Math.max(0, Math.min(5, 2.5 + f.buybackYield))
    : Math.max(0, Math.min(5, 2.5 - f.shareCountYoY / 4));

  return Math.max(0, Math.min(5, (roicComponent + marginTrendComponent + capitalAllocationComponent) / 3));
}

export function generateSummary(overall: number): string {
  if (overall >= 4.5) {
    return 'Exceptional business, likely trading near fair value or below. Strong fundamentals across all metrics.';
  } else if (overall >= 4) {
    return 'High-quality company with solid growth and profitability. Consider your entry point.';
  } else if (overall >= 3) {
    return 'Mixed signals. Some strong fundamentals, but risks or expensive valuation.';
  } else if (overall >= 2) {
    return 'Weak fundamentals or valuation concerns. Proceed with caution.';
  } else {
    return 'Significant concerns across fundamentals. Not a buy at current metrics.';
  }
}
