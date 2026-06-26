import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface UseWatchlistReturn {
  watchlist: string[];
  limit: number;
  loading: boolean;
  error: string | null;
  addTicker: (ticker: string) => Promise<boolean>;
  removeTicker: (ticker: string) => Promise<void>;
}

const API_BASE = '/api';

export function useWatchlist(enabled: boolean): UseWatchlistReturn {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/users/watchlist`);
      setWatchlist(res.data.watchlist || []);
      setLimit(res.data.limit || 20);
      setError(null);
    } catch {
      setError('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addTicker = async (ticker: string): Promise<boolean> => {
    try {
      const res = await axios.post(`${API_BASE}/users/watchlist`, { ticker: ticker.toUpperCase() });
      setWatchlist(res.data.watchlist || []);
      setError(null);
      return true;
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || 'Failed to add to watchlist');
      return false;
    }
  };

  const removeTicker = async (ticker: string) => {
    const res = await axios.delete(`${API_BASE}/users/watchlist/${ticker.toUpperCase()}`);
    setWatchlist(res.data.watchlist || []);
  };

  return { watchlist, limit, loading, error, addTicker, removeTicker };
}
