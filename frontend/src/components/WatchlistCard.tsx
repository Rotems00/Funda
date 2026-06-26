import React from 'react';
import { WatchlistStock } from '../hooks/useWatchlistData';
import { CompanyLogo } from './CompanyLogo';

interface WatchlistCardProps {
  stock: WatchlistStock;
  onOpen: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

const PILLAR_NAMES = ['G', 'P', 'V', 'S', 'W'];

function ratingColor(r: number): string {
  return r >= 3.5 ? '#34d399' : r >= 2.5 ? '#fbbf24' : r >= 1.5 ? '#f59e0b' : '#fb7185';
}

// Editorial tag derived from the overall rating
function ratingTag(r: number): string {
  if (r >= 4) return 'Quality compounder';
  if (r >= 3) return 'Solid fundamentals';
  if (r >= 2) return 'Speculative';
  return 'High risk';
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 120;
  const h = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * w;
    const y = h - 4 - ((v - min) / rng) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(',');
  const gradId = `wlspark-${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: 120, height: 40, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.3} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}

function Stars({ r }: { r: number }) {
  const pct = ((r / 5) * 100).toFixed(0);
  return (
    <span className="wl-stars">
      ★★★★★
      <span className="wl-stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

export const WatchlistCard: React.FC<WatchlistCardProps> = ({ stock, onOpen, onRemove }) => {
  const rc = ratingColor(stock.rating);
  const tagColor = ratingColor(stock.rating);

  return (
    <div className="wl-card" onClick={() => onOpen(stock.ticker)} style={{ ['--wl-accent' as any]: rc }}>
      <CompanyLogo ticker={stock.ticker} className="wl-avatar" fallbackColor={rc} />

      <div className="wl-name">
        <div className="wl-ticker">{stock.ticker}</div>
        <div className="wl-company">{stock.name}</div>
        <span className="wl-tag" style={{ color: tagColor, background: `${tagColor}1a` }}>{ratingTag(stock.rating)}</span>
      </div>

      <div className="wl-pillars">
        {stock.pillars.map((v, i) => {
          const c = v >= 3.5 ? '#34d399' : v >= 2.5 ? '#fbbf24' : '#fb7185';
          return (
            <div key={i} className="wl-pillar">
              <div className="wl-pillar-track">
                <div className="wl-pillar-fill" style={{ height: `${(v / 5) * 100}%`, background: c }} />
              </div>
              <span className="wl-pillar-name">{PILLAR_NAMES[i]}</span>
            </div>
          );
        })}
      </div>

      <div className="wl-spark">
        <Sparkline data={stock.spark} color={rc} />
      </div>

      <div className="wl-price">
        <div className="wl-price-val">${stock.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        <div className="wl-price-chg" style={{ color: stock.up ? '#34d399' : '#fb7185' }}>
          {stock.up ? '+' : ''}{stock.change.toFixed(1)}% YTD
        </div>
      </div>

      <div className="wl-rating">
        <div className="wl-rating-val" style={{ color: rc }}>{stock.rating.toFixed(1)}</div>
        <Stars r={stock.rating} />
      </div>

      <button
        className="wl-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(stock.ticker); }}
        aria-label={`Remove ${stock.ticker}`}
      >
        ×
      </button>
    </div>
  );
};
