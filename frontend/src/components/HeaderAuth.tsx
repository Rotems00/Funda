import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const HeaderAuth: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="header-auth">
        <button className="header-watchlist-link" onClick={() => navigate('/analyzer')}>
          Analyzer
        </button>
        <button className="header-signin-btn" onClick={() => navigate('/login')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="header-auth">
      <button className="header-watchlist-link" onClick={() => navigate('/analyzer')}>
        Analyzer
      </button>
      <button className="header-watchlist-link" onClick={() => navigate('/watchlist')}>
        Watchlist
      </button>
      {user.picture ? (
        <img src={user.picture} alt={user.name || user.email} className="header-avatar" />
      ) : (
        <div className="header-avatar header-avatar-fallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>
      )}
      <button className="header-signout-btn" onClick={() => signOut().then(() => navigate('/landing'))}>
        Sign out
      </button>
    </div>
  );
};
