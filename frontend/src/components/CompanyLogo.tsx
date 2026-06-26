import React, { useState } from 'react';

// FMP hosts logos on a public CDN keyed by ticker (no API key needed)
export function logoUrl(ticker: string): string {
  return `https://images.financialmodelingprep.com/symbol/${ticker.toUpperCase()}.png`;
}

interface CompanyLogoProps {
  ticker: string;
  className?: string;     // sizing/shape (e.g. "wl-avatar", "ticker-avatar")
  fallbackColor?: string; // gradient used for the letter fallback
}

// Renders the company logo with graceful fallback to a colored letter tile when
// no logo exists for the ticker.
export const CompanyLogo: React.FC<CompanyLogoProps> = ({ ticker, className = '', fallbackColor = '#10b981' }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${className} company-logo-fallback`}
        style={{ background: `linear-gradient(135deg, ${fallbackColor}, ${fallbackColor}bb)` }}
      >
        {ticker.charAt(0)}
      </div>
    );
  }

  return (
    <div className={`${className} company-logo`}>
      <img src={logoUrl(ticker)} alt={ticker} loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
};
