/**
 * Stock Schema - MongoDB/Mongoose models
 * Central definitions for all stock-related collections
 */

export interface IStock {
  ticker: string;
  cik?: string;
  companyName?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  // Daily price snapshot, refreshed ~once/day per the "fetch once, cache
  // forever" pipeline - not a live quote
  price?: number;
  ytdChange?: number;
  fromATH?: number;
  priceUpdatedAt?: Date;
  lastUpdated: Date;
  dataFreshness?: {
    ticker?: Date;
    fundamentals?: Date;
    price?: Date;
  };
}

export interface IFundamentalsQuarter {
  fiscalPeriod?: string; // "Q4"
  fiscalYear?: string; // "2025"
  endDate?: string; // "2025-12-31"
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  eps?: number;
  operatingIncome?: number;
  nonOperatingIncome?: number;
  operatingCashFlow?: number;
  dilutedShares?: number; // tracks buybacks (falling) vs dilution (rising)
  // From SEC EDGAR (Polygon doesn't expose these)
  cash?: number;
  capitalExpenditure?: number;
  buybacks?: number;
  dividendsPaid?: number;
  // Liquidity
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsPayable?: number;
  // Debt & asset quality
  totalAssets?: number;
  totalLiabilities?: number;
  longTermDebt?: number;
  intangibleAssets?: number; // goodwill/intangible-heavy balance sheets carry more risk
  equity?: number;
}

// One document per stock - every fetch/refresh reads and writes the whole
// quarter history together, so there's no need to split this into one
// document per quarter
export interface IFundamentals {
  stockId: string;
  cik?: string; // verifies the cached quarters belong to the right legal entity
  quarters: IFundamentalsQuarter[];
  // false when the SEC EDGAR enrichment (cash/CapEx/buybacks/dividends) failed
  // for this fetch, so a future read knows to retry it instead of trusting the
  // cash-less quarters as authoritative
  edgarComplete?: boolean;
  updatedAt: Date;
}

export interface IMetrics {
  stockId: string;
  rating?: number; // 0-5
  pillars?: {
    growing?: number;
    profitable?: number;
    fairlyPriced?: number;
    safe?: number;
    canKeepWinning?: number;
  };
  ratios?: {
    peRatio?: number | null; // null when TTM earnings aren't positive (P/E is undefined)
    pegRatio?: number | null;
    debtToEquity?: number;
    netMargin?: number;
    roic?: number;
  };
  trends?: {
    revenueYoY?: number; // %
    epsYoY?: number; // %
    revenueCagr5Y?: number; // %
    trajectory?: 'accelerating' | 'steady' | 'cooling';
  };
  // Granular per-pillar metrics, cached so the 5-pillar detail chips don't
  // need to recompute Fundamentals on every cache-hit request
  details?: {
    roe?: number;
    ocfToNetIncome?: number;
    currentRatio?: number;
    interestCoverage?: number;
    intangibleAssetRatio?: number;
    roicYoY?: number;
    operatingMarginYoY?: number;
    shareCountYoY?: number;
    buybackYield?: number | null;
  };
  // Wall Street analyst price targets + consensus rating
  analysts?: {
    consensus?: number | null;
    high?: number | null;
    low?: number | null;
    median?: number | null;
    analystCount?: number;
    rating?: string;
    upside?: number | null; // % vs current price
    targets?: Array<{ company: string; analyst?: string; priceTarget: number; date: string; url?: string }>;
  } | null;
  computedAt: Date;
}

export interface IPrice {
  stockId: string;
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  ytdChange?: number; // %
  athPrice?: number;
  atHighDistancePercent?: number; // %
}

export const WATCHLIST_LIMIT = 10;

export interface IUserProfile {
  userId: string; // Google's "sub" claim - stable unique ID for the account
  email: string;
  name?: string;
  picture?: string;
  sectors: string[]; // e.g., ["Software & IT", "Semiconductors"]
  confidence?: 'beginner' | 'intermediate' | 'advanced';
  watchlist: string[]; // tickers, capped at WATCHLIST_LIMIT
  recentSearches: string[]; // tickers
  createdAt?: Date;
}
