import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWatchlist } from '../hooks/useWatchlist';

interface WatchlistButtonProps {
  ticker: string;
}

export const WatchlistButton: React.FC<WatchlistButtonProps> = ({ ticker }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { watchlist, limit, addTicker, removeTicker } = useWatchlist(!!user);

  if (!user) {
    return (
      <button className="watchlist-toggle-btn" onClick={() => navigate('/login', { state: { from: `/${ticker}` } })}>
        + Sign in to save
      </button>
    );
  }

  const isSaved = watchlist.includes(ticker);
  const isFull = !isSaved && watchlist.length >= limit;

  return (
    <button
      className={`watchlist-toggle-btn ${isSaved ? 'saved' : ''}`}
      disabled={isFull}
      title={isFull ? `Watchlist is full (max ${limit})` : undefined}
      onClick={() => (isSaved ? removeTicker(ticker) : addTicker(ticker))}
    >
      {isSaved ? '✓ In Watchlist' : isFull ? `Watchlist full (${limit})` : '+ Add to Watchlist'}
    </button>
  );
};
