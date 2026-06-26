import { useState, useEffect } from 'react';
import axios from 'axios';

export type MomentumPeriod = 'annual' | 'quarterly';
export type MomentumRange = '2y' | '5y' | 'max';

export interface MomentumDataPoint {
  label: string;
  revenue: number;
  grossProfit: number;
  revenueYoY: number | null;
  netIncome: number;
  eps: number;
  netMargin: number;
  operatingCashFlow: number;
  freeCashFlow: number | null;
  cash: number | null;
  buybacks: number | null;
  debt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
}

interface UseMomentumReturn {
  data: MomentumDataPoint[];
  loading: boolean;
  error: string | null;
}

const API_BASE = '/api';

export function useMomentum(
  ticker: string | null,
  period: MomentumPeriod = 'annual',
  range: MomentumRange = '5y'
): UseMomentumReturn {
  const [data, setData] = useState<MomentumDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) {
      setData([]);
      setError(null);
      return;
    }

    const fetchMomentum = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          `${API_BASE}/stocks/${ticker.toUpperCase()}/momentum?period=${period}&range=${range}`
        );
        const rawData = response.data.data || [];
        // Annual points key off "year", quarterly off "label" - normalize to a single field
        const normalized: MomentumDataPoint[] = rawData.map((d: any) => ({
          label: d.year || d.label,
          revenue: d.revenue,
          grossProfit: d.grossProfit,
          revenueYoY: d.revenueYoY,
          netIncome: d.netIncome,
          eps: d.eps,
          netMargin: d.netMargin,
          operatingCashFlow: d.operatingCashFlow,
          freeCashFlow: d.freeCashFlow,
          cash: d.cash,
          buybacks: d.buybacks,
          debt: d.debt,
          debtToEquity: d.debtToEquity,
          currentRatio: d.currentRatio
        }));
        setData(normalized);
      } catch (err) {
        const errorMsg = axios.isAxiosError(err)
          ? err.response?.data?.error || 'Failed to fetch momentum data'
          : 'An error occurred';
        setError(errorMsg);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMomentum();
  }, [ticker, period, range]);

  return { data, loading, error };
}
