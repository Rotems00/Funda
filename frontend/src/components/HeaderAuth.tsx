import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const HeaderAuth: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  // Fall back to the initials avatar if the Google image fails to load
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [user?.picture]);

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
      {user.picture && !imgFailed ? (
        <img
          src={user.picture}
          alt={user.name || user.email}
          className="header-avatar"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="header-avatar header-avatar-fallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>
      )}
      <button className="header-signout-btn" onClick={() => signOut().then(() => navigate('/landing'))}>
        Sign out
      </button>
    </div>
  );
};
