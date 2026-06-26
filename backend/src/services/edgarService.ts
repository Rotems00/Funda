import axios from 'axios';

/**
 * SEC EDGAR Service
 * Free, as-reported XBRL data directly from SEC filings - fills the gaps
 * Polygon's standardized financials don't cover: cash, CapEx, buybacks,
 * dividends. Used to compute real Free Cash Flow and a real Cash vs Debt
 * picture instead of proxies.
 */

const EDGAR_BASE = 'https://data.sec.gov/api/xbrl/companyconcept';
// SEC requires a descriptive User-Agent identifying the requester
const USER_AGENT = 'FundaApp (contact: funda-app@example.com)';
// SEC throttles aggressively (~10 req/s) and occasionally 5xx's; retry transient
// failures with exponential backoff so a momentary blip doesn't masquerade as
// "this company has no cash data"
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10_000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 429 (rate limited) and 5xx (server) are worth retrying; so is a missing
// status (network error / timeout). Any other 4xx means our request itself is
// wrong and retrying won't help.
function isRetryable(status?: number): boolean {
  return status === 429 || status === undefined || (status >= 500 && status < 600);
}

interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  filed: string;
  fy?: number;   // fiscal year the filing reported this under
  fp?: string;   // fiscal period: Q1/Q2/Q3/FY
}

export interface EdgarQuarter {
  endDate: string;
  cash?: number;
  capitalExpenditure?: number;
  buybacks?: number;
  dividendsPaid?: number;
}

export interface EdgarRevenuePoint {
  endDate: string;
  revenue: number;
  fiscalYear?: string;
  fiscalPeriod?: string;
}

async function fetchConcept(cik: string, tag: string): Promise<XbrlFact[]> {
  const url = `${EDGAR_BASE}/CIK${cik}/us-gaap/${tag}.json`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: REQUEST_TIMEOUT_MS
      });
      return response.data?.units?.USD || [];
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;

      // 404 means this company genuinely never reported the concept (e.g. a
      // non-dividend payer has no PaymentsOfDividends facts) - a real, empty
      // answer, not a failure. Crucially distinct from a transient error so
      // the caller doesn't cache a blip as "no data".
      if (status === 404) return [];

      // A non-retryable 4xx (malformed request) won't improve on retry - fail fast
      if (!isRetryable(status)) throw error;

      lastError = error;
      if (attempt < MAX_RETRIES) {
        // exponential backoff with jitter: ~0.5s, 1s, 2s
        await delay(500 * 2 ** attempt + Math.random() * 250);
      }
    }
  }

  // Exhausted retries on a transient error - surface it so getEdgarQuarters
  // throws and the merge layer can mark this fetch as incomplete (retry later)
  // rather than persisting cash-less quarters as authoritative for a week.
  throw lastError;
}

/**
 * Point-in-time facts (balance sheet items like cash) need no discretization,
 * just dedup by end date, keeping the most recently filed value
 */
function instantSeries(facts: XbrlFact[]): Map<string, number> {
  const dedup = new Map<string, XbrlFact>();
  for (const f of facts) {
    const existing = dedup.get(f.end);
    if (!existing || f.filed > existing.filed) dedup.set(f.end, f);
  }
  return new Map([...dedup].map(([end, f]) => [end, f.val]));
}

/**
 * Duration facts (cash flow statement items) are reported cumulative
 * year-to-date within a fiscal year (e.g. the Q2 filing's value covers the
 * full H1, not just Q2) - this discretizes them into true per-quarter values
 * by grouping on fiscal-year start and differencing consecutive cumulative
 * totals
 */
function discretizeDurationSeries(facts: XbrlFact[]): Map<string, number> {
  const dedup = new Map<string, XbrlFact>();
  for (const f of facts) {
    if (!f.start) continue;
    const key = `${f.start}|${f.end}`;
    const existing = dedup.get(key);
    if (!existing || f.filed > existing.filed) dedup.set(key, f);
  }

  const groups = new Map<string, XbrlFact[]>();
  for (const f of dedup.values()) {
    const group = groups.get(f.start as string) || [];
    group.push(f);
    groups.set(f.start as string, group);
  }

  const result = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = group.sort((a, b) => a.end.localeCompare(b.end));
    let previousCumulative = 0;
    for (const f of sorted) {
      result.set(f.end, f.val - previousCumulative);
      previousCumulative = f.val;
    }
  }
  return result;
}

// Some concepts are reported under one of several interchangeable tags
// depending on the filer (e.g. a company that repurchases preferred as well as
// common may use the broader "...Equity" tag). Try them in order of preference
// and take the first that has data.
async function fetchFirstConcept(cik: string, tags: string[]): Promise<XbrlFact[]> {
  for (const tag of tags) {
    const facts = await fetchConcept(cik, tag);
    if (facts.length) return facts;
  }
  return [];
}

// Share repurchases: most filers use the common-stock tag; some report only the
// broader equity-repurchase tag. Both are cash-flow-statement outflows, so they
// discretize identically; we deliberately avoid treasury-stock balance tags and
// preferred-only tags, which aren't comparable common-buyback flows.
const BUYBACK_TAGS = [
  'PaymentsForRepurchaseOfCommonStock',
  'PaymentsForRepurchaseOfEquity'
];
// Dividends paid: the bare tag, or the common-stock-specific variant.
const DIVIDEND_TAGS = ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'];

/**
 * Get cash, CapEx, buybacks, and dividends per fiscal quarter end-date for a
 * company, keyed by CIK (the same CIK already verified against Polygon's
 * ticker lookup, so this never risks a wrong-company mismatch)
 */
export async function getEdgarQuarters(cik: string): Promise<EdgarQuarter[]> {
  const [cashFacts, capexFacts, buybackFacts, dividendFacts] = await Promise.all([
    fetchConcept(cik, 'CashAndCashEquivalentsAtCarryingValue'),
    fetchConcept(cik, 'PaymentsToAcquirePropertyPlantAndEquipment'),
    fetchFirstConcept(cik, BUYBACK_TAGS),
    fetchFirstConcept(cik, DIVIDEND_TAGS)
  ]);

  const cash = instantSeries(cashFacts);
  const capex = discretizeDurationSeries(capexFacts);
  const buybacks = discretizeDurationSeries(buybackFacts);
  const dividends = discretizeDurationSeries(dividendFacts);

  const allEndDates = new Set([...cash.keys(), ...capex.keys(), ...buybacks.keys(), ...dividends.keys()]);

  return [...allEndDates].map(endDate => ({
    endDate,
    cash: cash.get(endDate),
    capitalExpenditure: capex.get(endDate),
    buybacks: buybacks.get(endDate),
    dividendsPaid: dividends.get(endDate)
  }));
}

// Revenue is reported under different us-gaap tags depending on the filer and
// era: ASC 606 adopters use the contract-revenue tag, others the plain Revenues
// tag. Prefer the former, fall back to the latter.
const REVENUE_TAGS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'];

function durationDays(f: XbrlFact): number {
  if (!f.start) return 0;
  return (new Date(f.end).getTime() - new Date(f.start).getTime()) / (1000 * 60 * 60 * 24);
}

// A single fiscal quarter is ~13 weeks; a fiscal year ~52-53 weeks. These
// windows reject the 6-/9-month year-to-date facts that 10-Qs also include.
const isQuarterFact = (f: XbrlFact) => { const d = durationDays(f); return d >= 80 && d <= 100; };
const isAnnualFact = (f: XbrlFact) => { const d = durationDays(f); return d >= 330 && d <= 400; };

function dedupByLatestFiled<K>(facts: XbrlFact[], key: (f: XbrlFact) => K): XbrlFact[] {
  const map = new Map<K, XbrlFact>();
  for (const f of facts) {
    const existing = map.get(key(f));
    if (!existing || f.filed > existing.filed) map.set(key(f), f);
  }
  return [...map.values()];
}

/**
 * Per-fiscal-quarter revenue straight from SEC filings, used to fill the gaps
 * Polygon's free tier leaves in recent quarters. Crucially this also synthesizes
 * the fiscal Q4 - which no company files a standalone 10-Q for - by subtracting
 * the three reported quarters from the annual 10-K total.
 */
export async function getEdgarRevenue(cik: string): Promise<EdgarRevenuePoint[]> {
  let facts: XbrlFact[] = [];
  for (const tag of REVENUE_TAGS) {
    facts = await fetchConcept(cik, tag);
    if (facts.length) break;
  }
  if (facts.length === 0) return [];

  // Reported quarters (Q1-Q3), keyed by period end-date
  const quarterFacts = dedupByLatestFiled(facts.filter(isQuarterFact), f => `${f.start}|${f.end}`);
  const byEnd = new Map<string, EdgarRevenuePoint>();
  for (const f of quarterFacts) {
    byEnd.set(f.end, {
      endDate: f.end,
      revenue: f.val,
      fiscalYear: f.fy ? String(f.fy) : undefined,
      fiscalPeriod: f.fp && f.fp !== 'FY' ? f.fp : undefined
    });
  }

  // Derive Q4: annual total minus the three quarters that fall inside the same
  // fiscal year. Only when exactly three are present, so the subtraction is sound.
  const annualFacts = dedupByLatestFiled(facts.filter(isAnnualFact), f => f.end);
  for (const a of annualFacts) {
    if (byEnd.has(a.end)) continue; // a real Q4-at-year-end figure already exists
    const fyStart = new Date(a.start as string).getTime();
    const fyEnd = new Date(a.end).getTime();
    const within = [...byEnd.values()].filter(p => {
      const t = new Date(p.endDate).getTime();
      return t > fyStart && t < fyEnd;
    });
    if (within.length === 3) {
      const sum = within.reduce((s, p) => s + p.revenue, 0);
      byEnd.set(a.end, {
        endDate: a.end,
        revenue: a.val - sum,
        fiscalYear: a.fy ? String(a.fy) : undefined,
        fiscalPeriod: 'Q4'
      });
    }
  }

  return [...byEnd.values()];
}

export default { getEdgarQuarters, getEdgarRevenue };
