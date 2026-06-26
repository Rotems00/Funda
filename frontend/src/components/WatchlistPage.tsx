import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWatchlist } from '../hooks/useWatchlist';
import { useWatchlistData, WatchlistStock } from '../hooks/useWatchlistData';
import { WatchlistCard } from './WatchlistCard';
import { TickerAutocomplete } from './TickerAutocomplete';
import { HeaderAuth } from './HeaderAuth';

type SortKey = 'rating' | 'price' | 'name';

export const WatchlistPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { watchlist, limit, loading: listLoading, error, addTicker, removeTicker } = useWatchlist(!!user);
  const { stocks, loading: dataLoading } = useWatchlistData(watchlist);
  const [sortKey, setSortKey] = useState<SortKey>('rating');

  const sorted = useMemo(() => {
    const a = [...stocks];
    if (sortKey === 'rating') a.sort((x, y) => y.rating - x.rating);
    if (sortKey === 'price') a.sort((x, y) => y.price - x.price);
    if (sortKey === 'name') a.sort((x, y) => x.ticker.localeCompare(y.ticker));
    return a;
  }, [stocks, sortKey]);

  const avg = stocks.length ? stocks.reduce((s, x) => s + x.rating, 0) / stocks.length : 0;
  const top: WatchlistStock | undefined = [...stocks].sort((a, b) => b.rating - a.rating)[0];
  const needsReview = stocks.filter(s => s.rating < 2.5).length;

  return (
    <div className="wl-page">
      <div className="wl-shell">
        {/* NAV */}
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

        {/* HEADER + SUMMARY */}
        <div className="wl-head">
          <div>
            <div className="wl-title">Your Watchlist</div>
            <div className="wl-meta">{watchlist.length} of {limit} saved · sorted by {sortKey}</div>
          </div>
          {stocks.length > 0 && (
            <div className="wl-stats">
              <div className="wl-stat">
                <div className="wl-stat-label">Avg rating</div>
                <div className="wl-stat-row"><span className="wl-stat-val">{avg.toFixed(1)}</span><span className="wl-stat-star">★</span></div>
              </div>
              <div className="wl-stat">
                <div className="wl-stat-label">Top pick</div>
                <div className="wl-stat-val" style={{ color: '#34d399' }}>{top ? top.ticker : '—'}</div>
              </div>
              <div className="wl-stat">
                <div className="wl-stat-label">Needs review</div>
                <div className="wl-stat-val" style={{ color: '#f97316' }}>{needsReview}</div>
              </div>
            </div>
          )}
        </div>

        {/* ADD + SORT */}
        <div className="wl-controls">
          {watchlist.length < limit && (
            <div className="wl-add"><TickerAutocomplete onSelectTicker={(t) => addTicker(t)} /></div>
          )}
          {stocks.length > 0 && (
            <div className="wl-sort">
              <span className="wl-sort-label">Sort:</span>
              {(['rating', 'price', 'name'] as SortKey[]).map(k => (
                <span key={k} className={`wl-sortbtn ${sortKey === k ? 'active' : ''}`} onClick={() => setSortKey(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className="login-error">{error}</p>}

        {(listLoading || (dataLoading && stocks.length === 0)) && watchlist.length > 0 && (
          <p className="momentum-empty">Loading your watchlist…</p>
        )}

        {/* CARDS */}
        {sorted.length > 0 && (
          <div className="wl-cards">
            {sorted.map(s => (
              <WatchlistCard key={s.ticker} stock={s} onOpen={(t) => navigate(`/${t}`)} onRemove={removeTicker} />
            ))}
          </div>
        )}

        {/* EMPTY STATE */}
        {!listLoading && watchlist.length === 0 && (
          <div className="wl-empty">
            <div className="wl-empty-icon">🔭</div>
            <div className="wl-empty-title">Your watchlist is empty</div>
            <div className="wl-empty-sub">Search any ticker above and add it to track it here.</div>
          </div>
        )}

        <div className="wl-disclaimer">Informational only · not financial advice</div>
      </div>
    </div>
  );
};
