import React, { useState } from 'react';
import { HeaderAuth } from './HeaderAuth';

interface LandingHeroProps {
  onSelectTicker: (ticker: string) => void;
}

const POPULAR_TICKERS = ['NVDA', 'MELI', 'PLTR', 'CEG'];

const SAMPLE_PILLARS: [string, number, string][] = [
  ['Growing', 5.0, '#059669'],
  ['Profitable', 4.8, '#059669'],
  ['Fairly Priced', 2.4, '#f59e0b'],
  ['Safe', 4.5, '#059669'],
  ['Keep Winning', 4.6, '#059669']
];

const SAMPLE_SPARK_DATA = [3, 3.4, 4, 3.8, 4.6, 5, 5.6, 6.4, 7.1, 8.2, 9, 11];

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

export const LandingHero: React.FC<LandingHeroProps> = ({ onSelectTicker }) => {
  const [query, setQuery] = useState('');
  const sparkW = 100;
  const sparkH = 60;
  const spark = buildSparkPath(SAMPLE_SPARK_DATA, sparkW, sparkH);

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

          <div className="landing-sample-card">
            <div className="landing-sample-top">
              <div className="landing-sample-identity">
                <div className="landing-sample-avatar">N</div>
                <div>
                  <div className="landing-sample-ticker">NVDA</div>
                  <div className="landing-sample-name">NVIDIA Corp</div>
                </div>
              </div>
              <div className="landing-sample-score">
                <div className="landing-sample-score-value">4.6</div>
                <div className="landing-sample-stars">★★★★★</div>
              </div>
            </div>

            <svg viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" className="landing-sample-spark">
              <defs>
                <linearGradient id="landingSparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="1" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <polygon points={spark.area} fill="url(#landingSparkGrad)" />
              <polyline points={spark.line} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={spark.lastPoint[0]} cy={spark.lastPoint[1]} r={3.2} fill="#10b981" />
            </svg>

            <div className="landing-sample-bars">
              {SAMPLE_PILLARS.map(([label, value, color]) => (
                <div key={label} className="landing-sample-bar-row">
                  <span className="landing-sample-bar-label">{label}</span>
                  <div className="landing-sample-bar-track">
                    <div className="landing-sample-bar-fill" style={{ width: `${(value / 5) * 100}%`, background: color }} />
                  </div>
                  <span className="landing-sample-bar-value">{value.toFixed(1)}</span>
                </div>
              ))}
            </div>

            <div className="landing-sample-footer">
              <span>Sample rating</span>
              <span className="landing-sample-footer-tag">Elite quality →</span>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-disclaimer">
        Illustrative · informational only, not financial advice · data fetched once &amp; cached for every user
      </div>
    </div>
  );
};
