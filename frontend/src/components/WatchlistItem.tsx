import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStock } from '../hooks/useStock';

interface WatchlistItemProps {
  ticker: string;
  onRemove: (ticker: string) => void;
}

export const WatchlistItem: React.FC<WatchlistItemProps> = ({ ticker, onRemove }) => {
  const { stock, loading, error } = useStock(ticker);
  const navigate = useNavigate();

  return (
    <div className="watchlist-item">
      <div className="watchlist-item-main" onClick={() => navigate(`/${ticker}`)}>
        <div className="watchlist-item-avatar">{ticker.charAt(0)}</div>
        <div className="watchlist-item-info">
          <div className="watchlist-item-ticker">{ticker}</div>
          {loading && <div className="watchlist-item-status">Loading…</div>}
          {error && <div className="watchlist-item-status">Unavailable</div>}
          {stock && <div className="watchlist-item-status">{stock.companyName}</div>}
        </div>
      </div>

      {stock && !loading && (
        <div className="watchlist-item-rating">
          <span className="watchlist-item-score">{stock.rating.toFixed(1)}</span>
          <span className="watchlist-item-price">${stock.price.toLocaleString()}</span>
        </div>
      )}

      <button
        className="watchlist-item-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(ticker); }}
        aria-label={`Remove ${ticker} from watchlist`}
      >
        ✕
      </button>
    </div>
  );
};
