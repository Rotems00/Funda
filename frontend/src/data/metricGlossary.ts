/**
 * Plain-English explanations for every metric shown on the stock detail page.
 * These are STATIC and identical for every ticker — they teach the user what a
 * metric means, not what this particular company's value is. Keyed by a metric
 * id used by the <MetricTip> component.
 */

export interface MetricDef {
  title: string;
  body: string;   // what it is + why it matters
  rule?: string;  // quick rule-of-thumb for reading the number
}

export const METRIC_GLOSSARY: Record<string, MetricDef> = {
  // ----- Key Ratios -----
  peRatio: {
    title: 'P/E Ratio (Price / Earnings)',
    body: 'The share price divided by the company’s earnings per share over the last 12 months. It tells you how many dollars investors are paying for each $1 of annual profit.',
    rule: 'Lower can mean cheaper; a high P/E means the market expects strong growth. Only compare within the same industry. “N/A” means the company isn’t profitable on a trailing basis.'
  },
  forwardPE: {
    title: 'Forward P/E',
    body: 'Same idea as P/E, but using analysts’ forecast of NEXT year’s earnings instead of the past year. It shows how expensive the stock looks against expected future profit.',
    rule: 'A forward P/E well below the trailing P/E suggests analysts expect earnings to grow. Remember: estimates can be wrong.'
  },
  pegRatio: {
    title: 'PEG Ratio',
    body: 'The P/E divided by the earnings growth rate. It puts valuation in context — a high P/E can be justified if profits are growing fast.',
    rule: 'Around 1.0 is often seen as fair value; below 1 may be cheap for the growth on offer; above 2 starts to look expensive.'
  },
  debtToEquity: {
    title: 'Debt / Equity',
    body: 'Total debt divided by shareholders’ equity. It shows how much of the business is funded by borrowing versus the owners’ own capital.',
    rule: 'Lower is safer. Under ~0.5 is conservative; above ~1.0 means more debt than equity — riskier, though normal in some capital-heavy industries.'
  },
  netMargin: {
    title: 'Net Margin',
    body: 'Net profit as a percentage of revenue — how many cents of profit the company keeps from each dollar of sales after all costs, interest and taxes.',
    rule: 'Higher signals pricing power and efficiency. Above ~15% is strong; very thin margins leave little cushion when business slows.'
  },
  roic: {
    title: 'ROIC (Return on Invested Capital)',
    body: 'The profit the company generates as a percentage of all the capital invested in it (debt + equity). It measures how efficiently management turns money into more money.',
    rule: 'Above ~10%, and above the company’s cost of capital, is the mark of a quality business with a real edge.'
  },

  // ----- Pillar: Growing -----
  revenueYoY: {
    title: 'Revenue Growth (YoY)',
    body: 'How much sales grew compared with the same period one year ago. The top-line measure of whether demand is expanding.',
    rule: 'Positive and accelerating is good; negative means the business is shrinking.'
  },
  epsYoY: {
    title: 'EPS Growth (YoY)',
    body: 'Year-over-year growth in earnings per share (profit divided by share count). It captures bottom-line growth, including the boost from share buybacks.',
    rule: 'Rising EPS drives long-term returns, but it can be lumpy from quarter to quarter.'
  },
  revenueCagr5Y: {
    title: '5-Year Revenue CAGR',
    body: 'The average annual revenue growth rate over the past five years (compound annual growth rate), which smooths out individual strong or weak years.',
    rule: 'A steady double-digit CAGR points to durable, repeatable demand.'
  },
  trajectory: {
    title: 'Growth Trajectory',
    body: 'Whether growth is speeding up, holding steady, or cooling — based on the most recent trend versus the longer-term rate.',
    rule: '“Accelerating” is a positive sign; “cooling” warns that growth is fading.'
  },

  // ----- Pillar: Profitable -----
  roe: {
    title: 'ROE (Return on Equity)',
    body: 'Net profit as a percentage of shareholders’ equity — the return the company earns on the owners’ money.',
    rule: 'Above ~15% is generally strong, but be aware that heavy debt can artificially inflate ROE.'
  },
  earningsQuality: {
    title: 'Earnings Quality',
    body: 'Compares operating cash flow with reported net income. High quality means profits are backed by real cash coming in the door, not just accounting entries.',
    rule: 'Cash flow at or above net income = high quality. Persistently below it can be a red flag.'
  },

  // ----- Pillar: Safe -----
  currentRatio: {
    title: 'Current Ratio',
    body: 'Current assets divided by current liabilities — whether the company can cover its short-term bills with its short-term assets.',
    rule: 'Above 1.5 is comfortable; below 1.0 can signal liquidity strain.'
  },
  interestCoverage: {
    title: 'Interest Coverage',
    body: 'Operating profit divided by interest expense — how many times over the company could pay the interest on its debt from its profits.',
    rule: 'Higher is safer. Above 5× is healthy; below 2× means debt payments eat most of the profit.'
  },
  intangibles: {
    title: 'Intangible Assets',
    body: 'The share of the balance sheet made up of goodwill and intangibles (from acquisitions and brands) rather than hard, tangible assets.',
    rule: 'Lower is sturdier. A high share can mean write-down risk if past acquisitions disappoint.'
  },

  // ----- Pillar: Can Keep Winning (moat) -----
  roicTrend: {
    title: 'ROIC Trend',
    body: 'Whether return on invested capital is rising, flat, or falling year over year — a signal of whether the company’s competitive edge is strengthening or eroding.',
    rule: 'Rising ROIC suggests a widening moat; falling ROIC suggests competition is catching up.'
  },
  opMargin: {
    title: 'Operating Margin Trend',
    body: 'The direction of operating margin year over year — is the core business becoming more or less profitable?',
    rule: 'Rising margins point to pricing power or benefits of scale.'
  },
  buybacks: {
    title: 'Buybacks',
    body: 'Net shares repurchased (or issued) as a percentage of shares outstanding. Buybacks shrink the share count and lift the value of each remaining share.',
    rule: 'Net buybacks reward existing holders; heavy issuance dilutes them.'
  },
  shareCount: {
    title: 'Share Count Change',
    body: 'The year-over-year change in shares outstanding. Falling means buybacks (good for owners); rising means dilution.',
    rule: 'Watch for steady dilution — it quietly erodes your slice of the company.'
  }
};
