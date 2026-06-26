import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Holding } from './usePortfolio';

export interface Pillars {
  growing: number;
  profitable: number;
  fairlyPriced: number;
  safe: number;
  canKeepWinning: number;
}

export interface PortfolioPosition {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;     // shares * price
  rating: number;    // 0-5 Funda rating (0 for unrated ETFs)
  safe: number;      // 0-5 "Resilient" pillar (balance-sheet strength)
  pillars: Pillars;
  sector: string;
  isEtf: boolean;    // ETFs/funds have no fundamentals, so no Funda rating
  rated: boolean;    // false for ETFs — excluded from quality averages
}

// Per-ticker market data — everything that depends ONLY on the ticker, not on
// how many shares you hold. Keeping this separate from `shares` is what stops
// editing a share count from re-hitting the API.
interface TickerData {
  name: string;
  price: number;
  rating: number;
  pillars: Pillars;
  sector: string;
  isEtf: boolean;
  rated: boolean;
}

const ZERO_PILLARS: Pillars = { growing: 0, profitable: 0, fairlyPriced: 0, safe: 0, canKeepWinning: 0 };

const API_BASE = '/api';

async function fetchTickerData(ticker: string): Promise<TickerData | null> {
  try {
    const { data } = await axios.get(`${API_BASE}/stocks/${ticker}`);
    const pl = data.pillars || {};
    return {
      name: data.companyName || ticker,
      price: data.price ?? 0,
      rating: data.rating ?? 0,
      pillars: {
        growing: pl.growing ?? 0,
        profitable: pl.profitable ?? 0,
        fairlyPriced: pl.fairlyPriced ?? 0,
        safe: pl.safe ?? 0,
        canKeepWinning: pl.canKeepWinning ?? 0
      },
      sector: data.sector || 'Unknown',
      isEtf: false,
      rated: true
    };
  } catch {
    // No fundamentals (e.g. an ETF) — fall back to a light price quote so the
    // holding still shows in the portfolio, just without a rating.
    try {
      const { data } = await axios.get(`${API_BASE}/stocks/${ticker}/quote`);
      return {
        name: data.companyName || ticker,
        price: data.price ?? 0,
        rating: 0,
        pillars: ZERO_PILLARS,
        sector: data.sector || 'ETF',
        isEtf: !!data.isEtf,
        rated: false
      };
    } catch {
      return null;
    }
  }
}

/**
 * Enrich raw holdings (ticker + shares) with live price/rating/pillar data.
 *
 * The network fetch is keyed on the SET OF TICKERS only — so editing a share
 * count or cost basis never re-hits the API; `value` (= price × shares) is just
 * recomputed locally. New tickers are fetched once and cached in state.
 */
export function usePortfolioData(holdings: Holding[]): { positions: PortfolioPosition[]; loading: boolean } {
  const [dataByTicker, setDataByTicker] = useState<Record<string, TickerData>>({});
  const [loading, setLoading] = useState(true);

  // A primitive key that changes only when the SET of tickers changes (not on
  // share/cost edits), so the fetch effect doesn't re-run on every keystroke.
  const tickersKey = [...new Set(holdings.map(h => h.ticker))].sort().join(',');
  const tickers = useMemo(() => (tickersKey ? tickersKey.split(',') : []), [tickersKey]);

  useEffect(() => {
    if (tickers.length === 0) {
      setDataByTicker({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Only fetch tickers we don't already have data for (so adding one holding
    // doesn't refetch the rest)
    const missing = tickers.filter(t => !dataByTicker[t]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(missing.map(async t => ({ ticker: t, data: await fetchTickerData(t) })))
      .then(results => {
        if (cancelled) return;
        setDataByTicker(prev => {
          const next = { ...prev };
          results.forEach(r => { if (r.data) next[r.ticker] = r.data; });
          return next;
        });
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  // Cheap, synchronous merge of live data + current share counts — recomputed
  // on every keystroke without any network call.
  const positions = useMemo(
    () => holdings
      .map((h): PortfolioPosition | null => {
        const d = dataByTicker[h.ticker];
        if (!d) return null;
        return {
          ticker: h.ticker,
          name: d.name,
          shares: h.shares,
          price: d.price,
          value: d.price * h.shares,
          rating: d.rating,
          safe: d.pillars.safe,
          pillars: d.pillars,
          sector: d.sector,
          isEtf: d.isEtf,
          rated: d.rated
        };
      })
      .filter((p): p is PortfolioPosition => p !== null),
    [holdings, dataByTicker]
  );

  return { positions, loading };
}
