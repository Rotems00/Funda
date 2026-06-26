import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string })?.from || '/watchlist';

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError('Google did not return a credential. Please try again.');
      return;
    }
    try {
      await signInWithGoogle(response.credential);
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Sign-in failed. Please try again.');
    }
  };

  return (
    <div className="landing-page">
      <div className="login-center">
        <div className="login-card">
          <div className="landing-logo" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <div className="landing-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 16.5L10 11l3.2 3.2L19 7.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 7.5h4v4" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" stroke="#fff" strokeOpacity={0.5} strokeWidth={2.2} strokeLinecap="round" />
              </svg>
            </div>
            <div className="landing-wordmark">Funda<span className="landing-wordmark-dot">.</span></div>
          </div>

          <h2 className="login-title">Sign in to Funda</h2>
          <p className="login-subtitle">Save up to 10 stocks to your watchlist and track them over time.</p>

          <div className="login-google-btn">
            <GoogleLogin onSuccess={handleSuccess} onError={() => setError('Sign-in failed. Please try again.')} theme="filled_black" shape="pill" />
          </div>

          {error && <p className="login-error">{error}</p>}

          <p className="login-disclaimer">By continuing, you agree this is an informational tool only, not financial advice.</p>
        </div>
      </div>
    </div>
  );
};
