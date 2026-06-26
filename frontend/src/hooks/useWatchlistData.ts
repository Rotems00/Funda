import { useState, useEffect } from 'react';
import axios from 'axios';

export interface WatchlistStock {
  ticker: string;
  name: string;
  rating: number;
  price: number;
  change: number; // YTD %
  up: boolean;
  pillars: [number, number, number, number, number]; // G, P, V, S, W
  spark: number[]; // recent quarterly revenue trend
}

const API_BASE = '/api';

// Fetch the per-ticker display data (rating, pillars, price, revenue spark) for
// every ticker in the watchlist, in parallel. Reuses the cached detail/momentum
// endpoints, so repeat loads are served from cache.
export function useWatchlistData(tickers: string[]): { stocks: WatchlistStock[]; loading: boolean } {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [loading, setLoading] = useState(true);

  // join so the effect re-runs when the set of tickers changes
  const key = tickers.join(',');

  useEffect(() => {
    if (tickers.length === 0) {
      setStocks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      tickers.map(async (ticker): Promise<WatchlistStock | null> => {
        try {
          const [detailRes, momentumRes] = await Promise.all([
            axios.get(`${API_BASE}/stocks/${ticker}`),
            axios.get(`${API_BASE}/stocks/${ticker}/momentum?period=quarterly&range=2y`).catch(() => null)
          ]);
          const d = detailRes.data;
          const p = d.pillars || {};
          const spark = (momentumRes?.data?.data || [])
            .map((x: any) => x.revenue)
            .filter((v: any) => typeof v === 'number');
          return {
            ticker,
            name: d.companyName || ticker,
            rating: d.rating ?? 0,
            price: d.price ?? 0,
            change: d.ytdChange ?? 0,
            up: (d.ytdChange ?? 0) >= 0,
            pillars: [p.growing ?? 0, p.profitable ?? 0, p.fairlyPriced ?? 0, p.safe ?? 0, p.canKeepWinning ?? 0],
            spark: spark.length ? spark : [0, 0]
          };
        } catch {
          return null;
        }
      })
    ).then(results => {
      if (cancelled) return;
      setStocks(results.filter((s): s is WatchlistStock => s !== null));
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { stocks, loading };
}
