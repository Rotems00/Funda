import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePortfolio, RiskProfile } from '../hooks/usePortfolio';
import { usePortfolioData, PortfolioPosition } from '../hooks/usePortfolioData';
import { TickerAutocomplete } from './TickerAutocomplete';
import { CompanyLogo } from './CompanyLogo';
import { HeaderAuth } from './HeaderAuth';

const COLORS = ['#10b981', '#6366f1', '#0ea5e9', '#f59e0b', '#f43f5e', '#14b8a6', '#a855f7', '#84cc16', '#fb7185', '#38bdf8'];
const PROFILES: RiskProfile[] = ['Conservative', 'Balanced', 'Aggressive'];

const usd = (v: number) =>
  v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;

interface Note { tone: 'good' | 'warn' | 'info'; text: string; }

function analyze(positions: PortfolioPosition[], profile: RiskProfile) {
  const total = positions.reduce((s, p) => s + p.value, 0);
  const w = (p: PortfolioPosition) => (total ? p.value / total : 0);
  const wRating = positions.reduce((s, p) => s + w(p) * p.rating, 0);
  const wSafe = positions.reduce((s, p) => s + w(p) * p.safe, 0);

  const sorted = [...positions].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const topW = top ? w(top) : 0;

  const sectorW: Record<string, number> = {};
  positions.forEach(p => { sectorW[p.sector] = (sectorW[p.sector] || 0) + w(p); });
  const topSector = Object.entries(sectorW).sort((a, b) => b[1] - a[1])[0];

  // Internal fit gauge from balance-sheet safety, quality and concentration.
  // Used only to pick a relative verdict vs the chosen profile — we deliberately
  // don't surface an absolute "risk level", since the cutoffs are heuristic.
  const fitGauge = Math.max(0, Math.min(100,
    ((5 - wSafe) / 5) * 45 + ((5 - wRating) / 5) * 30 + Math.min(25, topW * 40)
  ));

  const bands: Record<RiskProfile, [number, number]> = {
    Conservative: [0, 40], Balanced: [30, 68], Aggressive: [52, 100]
  };
  const [lo, hi] = bands[profile];
  let fit: { tone: Note['tone']; title: string; text: string };
  if (fitGauge > hi) fit = { tone: 'warn', title: 'Leans more aggressive than your profile', text: `This leans more aggressive than a ${profile} approach — it's concentrated and/or tilts toward weaker-rated, less financially sturdy names. Consider trimming the most speculative or oversized positions.` };
  else if (fitGauge < lo) fit = { tone: 'info', title: 'More conservative than your profile', text: `This looks more defensive than a ${profile} approach — mostly higher-rated, financially sturdy names. You likely have room to add more growth if you want it.` };
  else fit = { tone: 'good', title: 'Fits your profile', text: `This lines up well with a ${profile} approach — quality and concentration look reasonable for how you invest.` };

  const notes: Note[] = [];
  if (top && topW > 0.35) notes.push({ tone: 'warn', text: `${top.ticker} is ${(topW * 100).toFixed(0)}% of the portfolio — heavily concentrated in one name.` });
  if (positions.length > 0 && positions.length < 4) notes.push({ tone: 'warn', text: `Only ${positions.length} holding${positions.length === 1 ? '' : 's'} — more names would cut single-stock risk.` });
  if (topSector && topSector[1] > 0.5) notes.push({ tone: 'warn', text: `${(topSector[1] * 100).toFixed(0)}% sits in ${topSector[0]} — sector-concentrated.` });
  if (wRating >= 3.7) notes.push({ tone: 'good', text: `Strong average quality — ${wRating.toFixed(1)}/5 weighted Funda rating.` });
  else if (wRating < 2.5) notes.push({ tone: 'warn', text: `Low average quality — ${wRating.toFixed(1)}/5 weighted rating, tilted toward weak fundamentals.` });
  if (wSafe >= 3.7) notes.push({ tone: 'good', text: `Financially sturdy — balance-sheet safety ${wSafe.toFixed(1)}/5.` });
  else if (wSafe < 2.5) notes.push({ tone: 'warn', text: `Elevated balance-sheet risk — safety ${wSafe.toFixed(1)}/5 across holdings.` });

  return { total, wRating, wSafe, topW, top, fit, notes };
}

export const PortfolioAnalyzer: React.FC = () => {
  const navigate = useNavigate();
  const { holdings, profile, setProfile, addHolding, setShares, setCost, removeHolding } = usePortfolio();
  const { positions, loading } = usePortfolioData(holdings);

  const a = analyze(positions, profile);
  const pieData = [...positions].sort((x, y) => y.value - x.value).map(p => ({ name: p.ticker, value: p.value }));

  // Gain/loss across positions that have a buy price set
  const costByTicker: Record<string, number | undefined> = {};
  holdings.forEach(h => { costByTicker[h.ticker] = h.cost; });
  const pnl = positions.reduce((acc, p) => {
    const c = costByTicker[p.ticker];
    if (c && c > 0) { acc.basis += c * p.shares; acc.value += p.value; }
    return acc;
  }, { basis: 0, value: 0 });
  const totalGain = pnl.basis > 0 ? pnl.value - pnl.basis : null;
  const totalGainPct = pnl.basis > 0 && totalGain !== null ? (totalGain / pnl.basis) * 100 : null;
  const gainColor = (totalGain ?? 0) >= 0 ? '#34d399' : '#fb7185';

  // AI review (local Ollama) — limited to once per day
  const DAY_MS = 24 * 60 * 60 * 1000;
  const [review, setReview] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [lastReviewAt, setLastReviewAt] = useState<number | null>(() => {
    const v = localStorage.getItem('funda_last_review_at');
    return v ? parseInt(v, 10) : null;
  });

  const sinceLast = lastReviewAt ? Date.now() - lastReviewAt : Infinity;
  const canReview = sinceLast >= DAY_MS;
  const remainingMs = canReview ? 0 : DAY_MS - sinceLast;
  const formatRemaining = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const markReviewed = (at: number) => {
    localStorage.setItem('funda_last_review_at', String(at));
    setLastReviewAt(at);
  };

  const requestReview = async () => {
    if (!canReview || reviewLoading) return;
    setReviewLoading(true);
    setReviewError(null);
    setReview(null);
    try {
      const holdingsPayload = positions.map(p => {
        const c = costByTicker[p.ticker];
        return {
          ticker: p.ticker,
          name: p.name,
          weightPct: a.total ? (p.value / a.total) * 100 : 0,
          rating: p.rating,
          sector: p.sector,
          gainPct: c && c > 0 ? ((p.price - c) / c) * 100 : null,
          pillars: p.pillars
        };
      });

      const resp = await fetch('/api/portfolio/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          totals: { totalValue: a.total, weightedRating: a.wRating, totalGainPct },
          holdings: holdingsPayload
        })
      });

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}));
        // Sync the local daily gate with the server's remaining time
        if (resp.status === 429 && typeof j.retryAfterMs === 'number') {
          markReviewed(Date.now() - (DAY_MS - j.retryAfterMs));
        }
        setReviewError(j.error || 'Review failed.');
        return;
      }

      // Stream the review in token-by-token
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      setReview('');
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setReview(text);
      }
      markReviewed(Date.now()); // consumed today's run
    } catch {
      setReviewError('Review failed.');
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="wl-page">
      <div className="wl-shell">
        <div className="wl-nav">
          <div className="logo" onClick={() => navigate('/landing')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">📈</span>
            <span className="logo-text">Funda</span>
          </div>
          <div className="wl-nav-search">
            <TickerAutocomplete onSelectTicker={(t) => navigate(`/${t.toUpperCase()}`)} />
          </div>
          <HeaderAuth />
        </div>

        <div className="wl-head">
          <div>
            <div className="wl-title">Portfolio Analyzer</div>
            <div className="wl-meta">Enter your holdings — we chart the allocation and check if it fits you.</div>
          </div>
          {positions.length > 0 && (
            <div className="wl-stats">
              <div className="wl-stat"><div className="wl-stat-label">Total value</div><div className="wl-stat-val">{usd(a.total)}</div></div>
              {totalGain !== null && (
                <div className="wl-stat"><div className="wl-stat-label">Total P&L</div><div className="wl-stat-val" style={{ color: gainColor }}>{totalGain >= 0 ? '+' : '−'}{usd(Math.abs(totalGain))}{totalGainPct !== null && <span style={{ fontSize: 13, marginLeft: 5 }}>({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)</span>}</div></div>
              )}
              <div className="wl-stat"><div className="wl-stat-label">Avg rating</div><div className="wl-stat-row"><span className="wl-stat-val">{a.wRating.toFixed(1)}</span><span className="wl-stat-star">★</span></div></div>
            </div>
          )}
        </div>

        {/* RISK PROFILE */}
        <div className="pa-profile">
          <span className="wl-sort-label">Your risk appetite:</span>
          {PROFILES.map(p => (
            <span key={p} className={`wl-sortbtn ${profile === p ? 'active' : ''}`} onClick={() => setProfile(p)}>{p}</span>
          ))}
        </div>

        {/* ADD */}
        <div className="pa-add">
          <TickerAutocomplete onSelectTicker={(t) => addHolding(t, 1)} />
          <span className="pa-add-hint">Pick a ticker to add it, then set your share count below.</span>
        </div>

        {holdings.length === 0 && (
          <div className="wl-empty">
            <div className="wl-empty-icon">📊</div>
            <div className="wl-empty-title">No holdings yet</div>
            <div className="wl-empty-sub">Search a ticker above to add it, then enter how many shares you own.</div>
          </div>
        )}

        {holdings.length > 0 && (
          <div className="pa-grid">
            {/* HOLDINGS TABLE */}
            <div className="pa-holdings">
              <div className="pa-holdings-head">
                <span>Holding</span><span>Shares</span><span>Avg cost</span><span>Value</span><span>P&L</span><span>Weight</span><span></span>
              </div>
              {positions.map((p, i) => {
                const weight = a.total ? (p.value / a.total) * 100 : 0;
                const cost = costByTicker[p.ticker];
                const gain = cost && cost > 0 ? p.value - cost * p.shares : null;
                const gainPct = cost && cost > 0 ? ((p.price - cost) / cost) * 100 : null;
                return (
                  <div key={p.ticker} className="pa-row">
                    <div className="pa-row-id" onClick={() => navigate(`/${p.ticker}`)}>
                      <CompanyLogo ticker={p.ticker} className="pa-logo" fallbackColor={COLORS[i % COLORS.length]} />
                      <div>
                        <div className="pa-row-ticker">{p.ticker} <span className="pa-row-rating">{p.rating.toFixed(1)}★</span></div>
                        <div className="pa-row-name">{p.name}</div>
                      </div>
                    </div>
                    <input
                      className="pa-shares"
                      type="number"
                      min={0}
                      value={p.shares}
                      onChange={(e) => setShares(p.ticker, parseFloat(e.target.value) || 0)}
                    />
                    <input
                      className="pa-shares"
                      type="number"
                      min={0}
                      placeholder="—"
                      value={cost ?? ''}
                      onChange={(e) => setCost(p.ticker, parseFloat(e.target.value) || 0)}
                    />
                    <div className="pa-row-value">{usd(p.value)}</div>
                    <div className="pa-row-pnl">
                      {gain === null ? <span className="pa-muted">—</span> : (
                        <span style={{ color: gain >= 0 ? '#34d399' : '#fb7185' }}>
                          {gain >= 0 ? '+' : '−'}{usd(Math.abs(gain))}
                          {gainPct !== null && <span className="pa-pnl-pct"> {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</span>}
                        </span>
                      )}
                    </div>
                    <div className="pa-row-weight"><span className="pa-dot" style={{ background: COLORS[pieData.findIndex(d => d.name === p.ticker) % COLORS.length] }} />{weight.toFixed(1)}%</div>
                    <button className="wl-remove" onClick={() => removeHolding(p.ticker)} aria-label={`Remove ${p.ticker}`}>×</button>
                  </div>
                );
              })}
              {loading && positions.length === 0 && <p className="momentum-empty">Loading prices…</p>}
            </div>

            {/* PIE */}
            <div className="pa-pie">
              <h3>Allocation</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [usd(Number(v)), String(n)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ANALYSIS */}
        {positions.length > 0 && (
          <div className={`pa-verdict pa-${a.fit.tone}`}>
            <div className="pa-verdict-title">{a.fit.title}</div>
            <div className="pa-verdict-text">{a.fit.text}</div>
          </div>
        )}

        {positions.length > 0 && a.notes.length > 0 && (
          <div className="pa-notes">
            {a.notes.map((n, i) => (
              <div key={i} className={`pa-note pa-${n.tone}`}>
                <span className="pa-note-icon">{n.tone === 'good' ? '✓' : n.tone === 'warn' ? '!' : 'i'}</span>
                <span>{n.text}</span>
              </div>
            ))}
          </div>
        )}

        {positions.length > 0 && (
          <div className="pa-ai">
            <div className="pa-ai-head">
              <div>
                <h3>🤖 AI Review</h3>
                <p className="momentum-subtitle">A local open-source model reads your holdings' Funda ratings and writes a plain-English review · one review per day.</p>
              </div>
              <button className="pa-ai-btn" onClick={requestReview} disabled={reviewLoading || !canReview}>
                {reviewLoading ? 'Analyzing…' : !canReview ? `Available in ${formatRemaining(remainingMs)}` : 'Review my holdings'}
              </button>
            </div>
            {reviewError && (
              <div className="pa-note pa-warn"><span className="pa-note-icon">!</span><span>{reviewError}</span></div>
            )}
            {review && <div className="pa-ai-body">{review}</div>}
          </div>
        )}

        <div className="wl-disclaimer">Informational only · not financial advice</div>
      </div>
    </div>
  );
};
