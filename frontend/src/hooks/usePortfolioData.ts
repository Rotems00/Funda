import { useState, useEffect } from 'react';
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
  rating: number;    // 0-5 Funda rating
  safe: number;      // 0-5 "Safe" pillar (balance-sheet strength)
  pillars: Pillars;
  sector: string;
}

const API_BASE = '/api';

// Enrich raw holdings (ticker + shares) with live price/rating/pillar/sector data
export function usePortfolioData(holdings: Holding[]): { positions: PortfolioPosition[]; loading: boolean } {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const key = holdings.map(h => `${h.ticker}:${h.shares}`).join(',');

  useEffect(() => {
    if (holdings.length === 0) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      holdings.map(async (h): Promise<PortfolioPosition | null> => {
        try {
          const { data } = await axios.get(`${API_BASE}/stocks/${h.ticker}`);
          const price = data.price ?? 0;
          const pl = data.pillars || {};
          return {
            ticker: h.ticker,
            name: data.companyName || h.ticker,
            shares: h.shares,
            price,
            value: price * h.shares,
            rating: data.rating ?? 0,
            safe: pl.safe ?? 0,
            pillars: {
              growing: pl.growing ?? 0,
              profitable: pl.profitable ?? 0,
              fairlyPriced: pl.fairlyPriced ?? 0,
              safe: pl.safe ?? 0,
              canKeepWinning: pl.canKeepWinning ?? 0
            },
            sector: data.sector || 'Unknown'
          };
        } catch {
          return null;
        }
      })
    ).then(results => {
      if (cancelled) return;
      setPositions(results.filter((p): p is PortfolioPosition => p !== null));
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { positions, loading };
}
