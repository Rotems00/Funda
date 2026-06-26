import React from 'react';

interface AnalystTarget {
  company: string;
  analyst?: string;
  priceTarget: number;
  date: string;
  url?: string;
}

interface AnalystData {
  consensus: number | null;
  high: number | null;
  low: number | null;
  median: number | null;
  analystCount: number;
  rating?: string;
  upside: number | null;
  targets?: AnalystTarget[];
}

interface AnalystTargetsProps {
  analysts?: AnalystData | null;
  price: number;
}

const usd = (v: number) => `$${v.toFixed(2)}`;

export const AnalystTargets: React.FC<AnalystTargetsProps> = ({ analysts, price }) => {
  if (!analysts || analysts.consensus == null) return null;

  const { consensus, high, low, analystCount, rating, upside, targets } = analysts;

  // Position price + consensus within the low–high target range for the bar
  const lo = Math.min(low ?? consensus, price, consensus);
  const hi = Math.max(high ?? consensus, price, consensus);
  const span = hi - lo || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));

  const upPos = (upside ?? 0) >= 0;
  const ratingClass = rating ? rating.toLowerCase().replace(/\s+/g, '-') : '';

  return (
    <div className="momentum-chart analyst-card">
      <div className="momentum-chart-header">
        <div>
          <h3>Analyst Price Targets</h3>
          <p className="momentum-subtitle">
            {analystCount > 0 ? `${analystCount} analyst${analystCount === 1 ? '' : 's'}` : 'Wall Street consensus'}
          </p>
        </div>
        {rating && <span className={`analyst-rating ${ratingClass}`}>{rating}</span>}
      </div>

      <div className="analyst-headline">
        <div>
          <div className="analyst-headline-label">Average target</div>
          <div className="analyst-headline-value">{usd(consensus)}</div>
        </div>
        {upside != null && (
          <span className={`momentum-chip ${upPos ? 'pos' : 'neg'}`}>
            {upPos ? '+' : ''}{upside.toFixed(1)}% vs price
          </span>
        )}
      </div>

      <div className="analyst-range">
        <div className="analyst-range-track">
          <div className="analyst-range-price" style={{ left: `${pct(price)}%` }} title={`Current price ${usd(price)}`} />
          <div className="analyst-range-target" style={{ left: `${pct(consensus)}%` }} title={`Avg target ${usd(consensus)}`} />
        </div>
        <div className="analyst-range-ends">
          <span>Low {low != null ? usd(low) : '—'}</span>
          <span className="analyst-range-now">Price {usd(price)}</span>
          <span>High {high != null ? usd(high) : '—'}</span>
        </div>
      </div>

      {targets && targets.length > 0 && (
        <div className="analyst-list">
          <div className="analyst-list-head">
            <span>Analyst</span>
            <span>Target</span>
          </div>
          {targets.map((t, i) => {
            const tUp = t.priceTarget >= price;
            const row = (
              <>
                <span className="analyst-list-firm">
                  {t.company}
                  {t.analyst && <span className="analyst-list-name"> · {t.analyst}</span>}
                  {t.date && <span className="analyst-list-date"> · {t.date}</span>}
                </span>
                <span className={`analyst-list-target ${tUp ? 'up' : 'down'}`}>{usd(t.priceTarget)}</span>
              </>
            );
            return t.url ? (
              <a key={i} className="analyst-list-row" href={t.url} target="_blank" rel="noreferrer">{row}</a>
            ) : (
              <div key={i} className="analyst-list-row">{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
};
