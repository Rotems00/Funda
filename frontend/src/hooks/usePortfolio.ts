import { useState, useEffect } from 'react';

export interface Holding {
  ticker: string;
  shares: number;
  cost?: number; // average buy price per share (optional)
}

export type RiskProfile = 'Conservative' | 'Balanced' | 'Aggressive';

// Max distinct holdings a portfolio can track (ETFs included).
export const PORTFOLIO_LIMIT = 20;

const HOLDINGS_KEY = 'funda_portfolio';
const PROFILE_KEY = 'funda_risk_profile';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Portfolio holdings + risk profile, persisted to localStorage (no backend).
export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>(() => load<Holding[]>(HOLDINGS_KEY, []));
  const [profile, setProfile] = useState<RiskProfile>(() => load<RiskProfile>(PROFILE_KEY, 'Balanced'));

  useEffect(() => { localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }, [profile]);

  const addHolding = (ticker: string, shares: number) => {
    const t = ticker.toUpperCase();
    const qty = shares > 0 ? shares : 1;
    setHoldings(prev => {
      const existing = prev.find(h => h.ticker === t);
      if (existing) return prev.map(h => (h.ticker === t ? { ...h, shares: h.shares + qty } : h));
      if (prev.length >= PORTFOLIO_LIMIT) return prev; // full — adding a new ticker is a no-op
      return [...prev, { ticker: t, shares: qty }];
    });
  };

  const setShares = (ticker: string, shares: number) =>
    setHoldings(prev => prev.map(h => (h.ticker === ticker ? { ...h, shares: Math.max(0, shares) } : h)));

  const setCost = (ticker: string, cost: number) =>
    setHoldings(prev => prev.map(h => (h.ticker === ticker ? { ...h, cost: cost > 0 ? cost : undefined } : h)));

  const removeHolding = (ticker: string) =>
    setHoldings(prev => prev.filter(h => h.ticker !== ticker));

  return { holdings, profile, setProfile, addHolding, setShares, setCost, removeHolding };
}
