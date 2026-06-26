import axios from 'axios';

/**
 * SEC EDGAR Service
 * Fetches financial filings from SEC EDGAR database
 * Includes: 10-K (annual), 10-Q (quarterly), 8-K (events)
 */

const SEC_API_BASE = 'https://www.sec.gov/cgi-bin/browse-edgar';
const SEC_COMPANY_API = 'https://data.sec.gov/submissions/CIK';

interface Filing {
  type: string; // 10-K, 10-Q, 8-K, S-1, etc.
  date: string; // Filing date
  url: string; // Link to filing
  cik: string; // Central Index Key
}

interface SECData {
  companyName: string;
  cik: string;
  filings: Filing[];
}

/**
 * Get CIK (Central Index Key) for a ticker
 * CIK is needed to fetch SEC filings
 */
export async function getCIK(ticker: string): Promise<string | null> {
  try {
    const response = await axios.get(`${SEC_API_BASE}`, {
      params: {
        action: 'getcompany',
        CIK: ticker,
        type: '',
        dateb: '',
        owner: 'exclude',
        count: 100,
        search_text: '',
        format: 'json'
      }
    });

    if (response.data?.cik_lookup) {
      // Search for exact match
      for (const company of response.data.cik_lookup) {
        if (company.ticker === ticker.toUpperCase()) {
          return company.cik_str.toString().padStart(10, '0');
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`Error getting CIK for ${ticker}:`, error);
    return null;
  }
}

/**
 * Get recent filings for a company
 */
export async function getRecentFilings(ticker: string, filingType: string = '10-K'): Promise<Filing[]> {
  try {
    const cik = await getCIK(ticker);
    if (!cik) {
      console.warn(`Could not find CIK for ticker: ${ticker}`);
      return [];
    }

    const response = await axios.get(`${SEC_API_BASE}`, {
      params: {
        action: 'getcompany',
        CIK: cik,
        type: filingType,
        dateb: '',
        owner: 'exclude',
        count: 10,
        format: 'json'
      }
    });

    if (response.data?.filings?.filing) {
      return response.data.filings.filing.slice(0, 5).map((filing: any) => ({
        type: filing.form,
        date: filing.filingdate,
        url: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${cik}&accession_number=${filing.accession_number}&xbrl_type=v`,
        cik
      }));
    }
    return [];
  } catch (error) {
    console.error(`Error fetching filings for ${ticker}:`, error);
    return [];
  }
}

/**
 * Get annual reports (10-K)
 */
export async function getAnnualReports(ticker: string): Promise<Filing[]> {
  return getRecentFilings(ticker, '10-K');
}

/**
 * Get quarterly reports (10-Q)
 */
export async function getQuarterlyReports(ticker: string): Promise<Filing[]> {
  return getRecentFilings(ticker, '10-Q');
}

/**
 * Get current reports / significant events (8-K)
 */
export async function getCurrentReports(ticker: string): Promise<Filing[]> {
  return getRecentFilings(ticker, '8-K');
}

/**
 * Get company facts (financials) from SEC
 */
export async function getCompanyFacts(ticker: string): Promise<any> {
  try {
    const cik = await getCIK(ticker);
    if (!cik) {
      console.warn(`Could not find CIK for ticker: ${ticker}`);
      return null;
    }

    const response = await axios.get(
      `${SEC_COMPANY_API}${cik}/CIK${cik}.json`
    );

    if (response.data) {
      return {
        name: response.data.entityName,
        cik: response.data.cik_str,
        facts: response.data.facts
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching company facts for ${ticker}:`, error);
    return null;
  }
}

/**
 * Extract key financial metrics from SEC filings
 * Focus on: revenue, net income, total assets, total debt
 */
export async function extractFinancialMetrics(ticker: string) {
  try {
    const facts = await getCompanyFacts(ticker);
    
    if (!facts || !facts.facts) {
      return null;
    }

    // Navigate through GAAP financial data
    const us_gaap = facts.facts['us-gaap'] || {};

    const metrics = {
      revenue: extractLatestValue(us_gaap, 'Revenues'),
      netIncome: extractLatestValue(us_gaap, 'NetIncomeLoss'),
      totalAssets: extractLatestValue(us_gaap, 'Assets'),
      totalLiabilities: extractLatestValue(us_gaap, 'Liabilities'),
      stockholdersEquity: extractLatestValue(us_gaap, 'StockholdersEquity'),
      operatingCashFlow: extractLatestValue(us_gaap, 'OperatingActivitiesCashFlow'),
      investingCashFlow: extractLatestValue(us_gaap, 'InvestingActivitiesCashFlow'),
      financingCashFlow: extractLatestValue(us_gaap, 'FinancingActivitiesCashFlow'),
      currentAssets: extractLatestValue(us_gaap, 'AssetsCurrent'),
      currentLiabilities: extractLatestValue(us_gaap, 'LiabilitiesCurrent'),
      longTermDebt: extractLatestValue(us_gaap, 'LongTermDebt'),
      shortTermBorrowings: extractLatestValue(us_gaap, 'ShortTermBorrowings')
    };

    return metrics;
  } catch (error) {
    console.error(`Error extracting financial metrics for ${ticker}:`, error);
    return null;
  }
}

/**
 * Helper: Extract latest value from SEC data structure
 */
function extractLatestValue(gaap: any, field: string): number | null {
  try {
    const fieldData = gaap[field];
    if (!fieldData || !fieldData.units || !fieldData.units.USD) {
      return null;
    }

    const values = fieldData.units.USD;
    if (Array.isArray(values) && values.length > 0) {
      // Get the most recent value (last entry)
      return values[values.length - 1].val || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export default {
  getCIK,
  getRecentFilings,
  getAnnualReports,
  getQuarterlyReports,
  getCurrentReports,
  getCompanyFacts,
  extractFinancialMetrics
};
