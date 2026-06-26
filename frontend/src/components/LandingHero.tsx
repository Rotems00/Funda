import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { HeaderAuth } from './HeaderAuth';

interface LandingHeroProps {
  onSelectTicker: (ticker: string) => void;
}

const POPULAR_TICKERS = ['NVDA', 'MELI', 'PLTR', 'CEG'];

interface SampleStock {
  ticker: string;
  name: string;
  avatar: string;
  score: number;
  spark: number[];
  pillars: [string, number][]; // Fairly Priced intentionally excluded
}

// Hero sample cards. These values are the instant-render fallback; on mount we
// replace them with each ticker's real Funda rating, pillars and revenue spark.
const SAMPLE_STOCKS: SampleStock[] = [
  {
    ticker: 'NVDA', name: 'NVIDIA Corp', avatar: 'N', score: 4.6,
    spark: [3, 3.4, 4, 3.8, 4.6, 5, 5.6, 6.4, 7.1, 8.2, 9, 11],
    pillars: [['Growing', 5.0], ['Profitable', 4.8], ['Resilient', 4.5], ['Keep Winning', 4.6]]
  },
  {
    ticker: 'UBER', name: 'Uber Technologies', avatar: 'U', score: 4.1,
    spark: [2.6, 2.4, 2.9, 3.2, 3.1, 3.6, 4, 4.3, 4.2, 4.6, 5, 5.4],
    pillars: [['Growing', 4.7], ['Profitable', 3.6], ['Resilient', 3.4], ['Keep Winning', 4.2]]
  },
  {
    ticker: 'MU', name: 'Micron Technology', avatar: 'M', score: 3.6,
    spark: [4, 3.2, 2.6, 2.2, 2.8, 3, 3.6, 3.4, 4, 4.4, 4.2, 4.8],
    pillars: [['Growing', 4.4], ['Profitable', 3.2], ['Resilient', 3.3], ['Keep Winning', 3.7]]
  }
];

function colorForScore(v: number): string {
  if (v >= 4.4) return '#059669';
  if (v >= 3.3) return '#10b981';
  if (v >= 2.9) return '#f59e0b';
  return '#f97316';
}

function starString(score: number): string {
  const full = Math.max(0, Math.min(5, Math.round(score)));
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
}

function buildSparkPath(values: number[], width: number, height: number): { line: string; area: string; lastPoint: [number, number] } {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 5 - ((v - min) / range) * (height - 10);
    return [x, y] as [number, number];
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return { line, area, lastPoint: points[points.length - 1] };
}

const SampleCard: React.FC<{ stock: SampleStock; onClick?: () => void }> = ({ stock, onClick }) => {
  const spark = buildSparkPath(stock.spark, 100, 34);
  const gradId = `landingSparkGrad-${stock.ticker}`;
  return (
    <div className="landing-sample-card landing-sample-card-compact" onClick={onClick} role="button">
      <div className="landing-sample-top">
        <div className="landing-sample-identity">
          <div className="landing-sample-avatar">{stock.avatar}</div>
          <div>
            <div className="landing-sample-ticker">{stock.ticker}</div>
            <div className="landing-sample-name">{stock.name}</div>
          </div>
        </div>
        <div className="landing-sample-score">
          <div className="landing-sample-score-value">{stock.score.toFixed(1)}</div>
          <div className="landing-sample-stars">{starString(stock.score)}</div>
        </div>
      </div>

      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="landing-sample-spark">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#10b981" stopOpacity={0.28} />
            <stop offset="1" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={spark.area} fill={`url(#${gradId})`} />
        <polyline points={spark.line} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={spark.lastPoint[0]} cy={spark.lastPoint[1]} r={3} fill="#10b981" />
      </svg>

      <div className="landing-sample-bars">
        {stock.pillars.map(([label, value]) => (
          <div key={label} className="landing-sample-bar-row">
            <span className="landing-sample-bar-label">{label}</span>
            <div className="landing-sample-bar-track">
              <div className="landing-sample-bar-fill" style={{ width: `${(value / 5) * 100}%`, background: colorForScore(value) }} />
            </div>
            <span className="landing-sample-bar-value">{value.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LandingHero: React.FC<LandingHeroProps> = ({ onSelectTicker }) => {
  const [query, setQuery] = useState('');
  // Start with the static fallback, then fill in real ratings per ticker.
  const [cards, setCards] = useState<SampleStock[]>(SAMPLE_STOCKS);

  useEffect(() => {
    let cancelled = false;
    SAMPLE_STOCKS.forEach(async (base) => {
      try {
        const [detailRes, momRes] = await Promise.all([
          axios.get(`/api/stocks/${base.ticker}`),
          axios.get(`/api/stocks/${base.ticker}/momentum?period=annual&range=5y`).catch(() => null)
        ]);
        if (cancelled) return;
        const d = detailRes.data;
        const p = d.pillars || {};
        const pillars: [string, number][] = [
          ['Growing', p.growing ?? 0],
          ['Profitable', p.profitable ?? 0],
          ['Resilient', p.safe ?? 0],
          ['Keep Winning', p.canKeepWinning ?? 0]
        ];
        const revs: number[] = ((momRes?.data?.data || []) as any[])
          .map(x => x.revenue)
          .filter((v): v is number => typeof v === 'number' && v > 0);
        setCards(prev => prev.map(c => c.ticker === base.ticker ? {
          ...c,
          name: d.companyName || c.name,
          score: typeof d.rating === 'number' ? d.rating : c.score,
          pillars,
          spark: revs.length >= 2 ? revs : c.spark
        } : c));
      } catch {
        /* keep the static fallback for this card if the API is unavailable */
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = query.trim().toUpperCase();
    if (ticker) onSelectTicker(ticker);
  };

  return (
    <div className="landing-page">
      <div className="landing-shell landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 16.5L10 11l3.2 3.2L19 7.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 7.5h4v4" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 20h14" stroke="#fff" strokeOpacity={0.5} strokeWidth={2.2} strokeLinecap="round" />
            </svg>
          </div>
          <div className="landing-wordmark">Funda<span className="landing-wordmark-dot">.</span></div>
        </div>
        <div className="landing-navlinks">
          <span className="landing-navlink">Top Rated</span>
          <span className="landing-navlink">How it works</span>
          <HeaderAuth />
        </div>
      </div>

      <div className="landing-shell landing-hero-wrap">
        <div className="landing-hero-grid">
          <div>
            <div className="landing-badge">
              <span className="landing-badge-dot" />
              <span>AI FUNDAMENTAL RATINGS · US STOCKS</span>
            </div>

            <div className="landing-h1">
              Know what a stock is <span className="landing-gradtext">really</span> worth.
            </div>

            <div className="landing-subhead">
              An AI reads the filings, multi-year trends and latest news — then scores any company <b>0–5</b> on the five things that actually matter. Not hype. Not price action.
            </div>

            <form onSubmit={handleSubmit} className="landing-search-form">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any ticker — NVDA, MELI, PLTR…"
                className="landing-search-input"
              />
              <button type="submit" className="landing-rate-btn">Rate →</button>
            </form>

            <div className="landing-popular">
              <span className="landing-popular-label">Popular:</span>
              {POPULAR_TICKERS.map(t => (
                <span key={t} className="landing-chip" onClick={() => onSelectTicker(t)}>{t}</span>
              ))}
            </div>

            <div className="landing-trust-strip">
              <div>
                <div className="landing-stat-value">5</div>
                <div className="landing-stat-label">pillars per score</div>
              </div>
              <div className="landing-stat-div" />
              <div>
                <div className="landing-stat-value">14+</div>
                <div className="landing-stat-label">metrics analyzed</div>
              </div>
              <div className="landing-stat-div" />
              <div>
                <div className="landing-stat-value">5yr</div>
                <div className="landing-stat-label">trend history</div>
              </div>
            </div>
          </div>

          <div className="landing-sample-stack">
            {cards.map(s => <SampleCard key={s.ticker} stock={s} onClick={() => onSelectTicker(s.ticker)} />)}
            <div className="landing-sample-caption">Live Funda ratings · tap a card</div>
          </div>
        </div>
      </div>

      <div className="landing-disclaimer">
        Illustrative · informational only, not financial advice · data fetched once &amp; cached for every user
      </div>
    </div>
  );
};
