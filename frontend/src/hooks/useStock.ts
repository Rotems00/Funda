import { useState, useEffect } from 'react';
import axios from 'axios';

export interface Stock {
  ticker: string;
  companyName: string;
  exchange: string;
  sector: string;
  industry: string;
  price: number;
  ytdChange: number;
  fromATH: number; // negative = below ATH
  rating: number; // 0-5
  summary: string;
  pillars: {
    growing: number;
    profitable: number;
    fairlyPriced: number;
    safe: number;
    canKeepWinning: number;
  };
  ratios: {
    peRatio: number | null;
    forwardPE?: number | null;
    pegRatio: number | null;
    debtToEquity: number;
    netMargin: number;
    roic: number;
  };
  trends: {
    revenueYoY: number;
    epsYoY: number;
    revenueCagr5Y: number;
    trajectory: 'accelerating' | 'steady' | 'cooling';
  };
  details: {
    roe: number;
    ocfToNetIncome: number;
    currentRatio: number;
    interestCoverage: number;
    intangibleAssetRatio: number;
    roicYoY: number;
    operatingMarginYoY: number;
    shareCountYoY: number;
    buybackYield: number | null;
  };
  analysts?: {
    consensus: number | null;
    high: number | null;
    low: number | null;
    median: number | null;
    analystCount: number;
    rating?: string;
    upside: number | null;
    targets?: Array<{ company: string; analyst?: string; priceTarget: number; date: string; url?: string }>;
  } | null;
}

interface UseStockReturn {
  stock: Stock | null;
  loading: boolean;
  error: string | null;
}

const API_BASE = '/api';

export function useStock(ticker: string | null): UseStockReturn {
  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker || ticker.trim().length === 0) {
      setStock(null);
      setError(null);
      return;
    }

    const fetchStock = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_BASE}/stocks/${ticker.toUpperCase()}`);
        setStock(response.data);
      } catch (err) {
        const errorMsg = axios.isAxiosError(err) 
          ? err.response?.data?.error || 'Failed to fetch stock data'
          : 'An error occurred';
        setError(errorMsg);
        setStock(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [ticker]);

  return { stock, loading, error };
}
